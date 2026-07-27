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
 * Primary model: small.en (~466MB) — much better accuracy than tiny, still CPU-viable.
 * Fallback model: tiny.en (~75MB) — fast, low memory, always available.
 *
 * whisper.cpp is a lightweight CPU-only C++ inference engine for OpenAI Whisper
 * models. No GPU required.
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
      const filePath = await preprocessAudio(originalPath);

      const whisperBinary = process.env.WHISPER_BINARY || 'whisper-cli';
      const primaryModel = process.env.WHISPER_MODEL || '/app/whisper-models/ggml-small.en.bin';
      const fallbackModel = process.env.WHISPER_MODEL_FALLBACK || '/app/whisper-models/ggml-tiny.en.bin';

      // Detect language from request or let whisper auto-detect
      const language = (req.body as any)?.language || 'auto';

      // ── Try primary model (small.en), fall back to tiny if unavailable ──
      try {
        const result = await transcribeWithModel(
          req, whisperBinary, primaryModel, filePath, language, 120_000,
        );
        await cleanupBoth(originalPath, filePath);
        res.json(result);
      } catch (primaryErr: any) {
        console.warn('[stt] Primary model failed, trying fallback:', primaryErr.message);

        try {
          const result = await transcribeWithModel(
            req, whisperBinary, fallbackModel, filePath, language, 60_000,
          );
          await cleanupBoth(originalPath, filePath);
          res.json({ ...result, model: 'fallback' });
        } catch (fallbackErr: any) {
          await cleanupBoth(originalPath, filePath);
          if (!res.headersSent) {
            res.status(500).json({
              error: 'Transcription failed',
              details: fallbackErr.message,
            });
          }
        }
      }
    },
  );

  return router;
}

/**
 * Run whisper.cpp with a specific model and return the transcription result.
 */
async function transcribeWithModel(
  req: Request,
  whisperBinary: string,
  modelPath: string,
  filePath: string,
  language: string,
  timeoutMs: number,
): Promise<{ text: string; language: string; model?: string }> {
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

  return new Promise((resolve, reject) => {
    const proc = spawn(whisperBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`STT engine unavailable: ${err.message}`));
    });

    proc.on('close', (code) => {
      try {
        const outputPath = filePath + '.txt';
        let text = '';
        let detectedLanguage = language;

        if (fs.existsSync(outputPath)) {
          text = fs.readFileSync(outputPath, 'utf-8').trim();
          cleanupFile(outputPath);
        }

        // Extract detected language from stderr
        const langMatch = stderr.match(/auto-detected language[:\s]+(\w+)/i);
        if (langMatch) {
          detectedLanguage = langMatch[1];
        }

        if (code !== 0 && !text) {
          console.error(`[stt] whisper.cpp failed (code ${code}):`, stderr.slice(-300));
          reject(new Error(`Transcription failed (exit ${code})`));
          return;
        }

        if (!text) {
          reject(new Error('No speech detected in audio'));
          return;
        }

        resolve({ text, language: detectedLanguage });
      } catch (err) {
        reject(err);
      }
    });

    // Clean up if client disconnects
    req.on('close', () => {
      if (!proc.killed) proc.kill();
      reject(new Error('Client disconnected'));
    });
  });
}

/**
 * Convert uploaded audio to 16kHz mono WAV via ffmpeg.
 * Falls back to the original file if ffmpeg is unavailable or fails.
 */
async function preprocessAudio(inputPath: string): Promise<string> {
  const outputPath = inputPath + '.ffmpeg.wav';

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-sample_fmt', 's16',
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
