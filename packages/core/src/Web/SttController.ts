import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { spawn } from 'child_process';
import multer from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Controller for Speech-to-Text using whisper.cpp.
 *
 * Accepts an audio file via POST /api/stt (multipart/form-data, field "audio"),
 * runs whisper.cpp locally to transcribe, and returns the transcribed text.
 *
 * whisper.cpp is a lightweight CPU-only C++ inference engine for OpenAI Whisper
 * models. We ship the tiny model (~75MB) which balances size and accuracy.
 */
export function GetSttRouter(messageLimiter: RateLimitRequestHandler): Router {
  const router = Router();

  // Configure multer for single audio file upload — 10MB max, temp dir
  const upload = multer({
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename: (_req, file, cb) => {
        // Preserve extension for whisper.cpp to detect format
        const ext = path.extname(file.originalname) || '.wav';
        cb(null, `stt-${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
        'audio/flac',
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported audio format: ${file.mimetype}`));
      }
    },
  });

  router.post(
    '/api/stt',
    messageLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('audio')(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'Audio file too large (max 10MB)' });
            return;
          }
          res.status(400).json({ error: err.message });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: 'Missing "audio" file upload' });
        return;
      }

      const originalPath = file.path;

      // Preprocess audio with ffmpeg to 16kHz mono WAV for consistent whisper.cpp input.
      // Falls back to the original file if ffmpeg is unavailable or fails.
      const filePath = await preprocessAudio(originalPath);

      const whisperBinary = process.env.WHISPER_BINARY || 'whisper-cli';
      const modelPath = process.env.WHISPER_MODEL || '/app/whisper-models/ggml-tiny.en.bin';

      // Detect language from request or let whisper auto-detect
      const language = (req.body as any)?.language || 'auto';

      const args: string[] = [
        '-m', modelPath,
        '-f', filePath,
        '--no-timestamps',
        '--output-txt',
        '--output-file', filePath, // writes to filePath + '.txt'
      ];

      if (language !== 'auto') {
        args.push('-l', language);
      }

      try {
        const proc = spawn(whisperBinary, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 60_000, // 60 second timeout for transcription
        });

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('error', async (err) => {
          console.error('[stt] whisper.cpp spawn error:', err);
          await cleanupBoth(originalPath, filePath);
          if (!res.headersSent) {
            res.status(500).json({ error: 'STT engine unavailable' });
          } else {
            res.end();
          }
        });

        proc.on('close', async (code) => {
          try {
            // whisper.cpp writes output to <filePath>.txt
            const outputPath = filePath + '.txt';
            let text = '';
            let detectedLanguage = language;

            if (fs.existsSync(outputPath)) {
              text = fs.readFileSync(outputPath, 'utf-8').trim();
              // Clean up output file
              await cleanupFile(outputPath);
            }

            // Try to extract detected language from stderr
            // whisper.cpp logs: "auto-detected language: en"
            const langMatch = stderr.match(/auto-detected language[:\s]+(\w+)/i);
            if (langMatch) {
              detectedLanguage = langMatch[1];
            }

            await cleanupBoth(originalPath, filePath);

            if (code !== 0 && !text) {
              console.error(`[stt] whisper.cpp failed (code ${code}):`, stderr);
              res.status(500).json({
                error: 'Transcription failed',
                details: stderr.slice(-500),
              });
              return;
            }

            if (!text) {
              res.status(422).json({ error: 'No speech detected in audio' });
              return;
            }

            res.json({ text, language: detectedLanguage });
          } catch (err) {
            await cleanupBoth(originalPath, filePath);
            next(err);
          }
        });

        // Clean up if client disconnects
        req.on('close', () => {
          if (!proc.killed) {
            proc.kill();
          }
          cleanupBoth(originalPath, filePath);
        });
      } catch (error) {
        await cleanupBoth(originalPath, filePath);
        next(error);
      }
    },
  );

  return router;
}

/**
 * Convert uploaded audio to 16kHz mono WAV via ffmpeg.
 * Falls back to the original file if ffmpeg is unavailable or fails.
 * The caller is responsible for cleaning up both the original file
 * and the returned file (if different) after transcription.
 */
async function preprocessAudio(inputPath: string): Promise<string> {
  const outputPath = inputPath + '.ffmpeg.wav';

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',           // overwrite output file if it exists
        '-i', inputPath,
        '-ar', '16000', // 16kHz sample rate
        '-ac', '1',     // mono
        '-sample_fmt', 's16', // 16-bit signed PCM
        outputPath,
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        console.warn('[stt] ffmpeg spawn error (falling back to original):', err.message);
        reject(err);
      });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          console.warn(`[stt] ffmpeg exited ${code} (falling back to original):`, stderr.slice(-500));
          reject(new Error(`ffmpeg exited ${code}`));
        }
      });
    });
    return outputPath;
  } catch {
    // Fall back to original file
    await cleanupFile(outputPath);
    return inputPath;
  }
}

/** Clean up both the original upload and the preprocessed file (if different). */
async function cleanupBoth(originalPath: string, processedPath: string): Promise<void> {
  await cleanupFile(originalPath);
  if (processedPath !== originalPath) {
    await cleanupFile(processedPath);
  }
}

/** Delete a temp file, swallowing any errors. */
async function cleanupFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // best-effort
  }
}
