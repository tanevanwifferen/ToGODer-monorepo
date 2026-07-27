import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { spawn } from 'child_process';

/**
 * Controller for Text-to-Speech.
 *
 * Accepts text via POST /api/tts and returns MP3 audio.
 *
 * Primary engine: Piper TTS — neural, CPU-only, natural-sounding voices.
 *   echo text | piper --model voice.onnx --output-raw
 *   → raw 16-bit 22050 Hz mono PCM
 *   → ffmpeg → MP3 (44100 Hz mono, 64k)
 *
 * Fallback engine: espeak-ng — tiny CPU-only formant synth (~2MB).
 *   espeak-ng --stdout → WAV → ffmpeg → MP3
 *
 * Environment variables:
 *   PIPER_BINARY    path to piper binary (default: piper)
 *   PIPER_MODEL     path to .onnx voice model (default: none → fallback)
 */
export function GetTtsRouter(messageLimiter: RateLimitRequestHandler): Router {
  const router = Router();

  router.post(
    '/api/tts',
    messageLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { text, voice, rate } = req.body as {
          text?: string;
          voice?: string;
          rate?: number;
        };

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          res.status(400).json({ error: 'Missing or empty "text" field' });
          return;
        }

        // Sanity cap — 5000 chars is ~5 min of speech
        const safeText = text.slice(0, 5000);

        // ── Primary: Piper TTS (neural, natural quality) ──────────
        const piperBinary = process.env.PIPER_BINARY || 'piper';
        const piperModel = process.env.PIPER_MODEL;

        if (piperModel) {
          try {
            await streamPiperTts(req, res, safeText, piperBinary, piperModel);
            return;
          } catch (err) {
            console.warn('[tts] Piper TTS failed, falling back to espeak-ng:', err);
          }
        }

        // ── Fallback: espeak-ng (formant synth, always available) ──
        await streamEspeakTts(req, res, safeText, voice, rate);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

/**
 * Stream TTS audio via Piper → ffmpeg → MP3 to the response.
 *
 * Piper outputs raw 16-bit 22050 Hz mono PCM on stdout.
 * We pipe that through ffmpeg to produce a universally playable MP3 stream.
 */
function streamPiperTts(
  req: Request,
  res: Response,
  text: string,
  piperBinary: string,
  piperModel: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // ── Stage 1: piper → raw PCM on stdout ────────────────────
    const piper = spawn(piperBinary, [
      '--model', piperModel,
      '--output-raw',       // Raw 16-bit 22050 Hz PCM
      '-f', '-',            // Write to stdout
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write text to piper stdin and close
    piper.stdin.write(text);
    piper.stdin.end();

    // ── Stage 2: ffmpeg normalization → MP3 ───────────────────
    const ffmpeg = spawn('ffmpeg', [
      '-f', 's16le',         // Raw signed 16-bit PCM
      '-ar', '22050',        // Piper's native sample rate
      '-ac', '1',            // Mono
      '-i', 'pipe:0',        // Read raw PCM from piper stdout
      '-acodec', 'libmp3lame',
      '-ar', '44100',        // Standard 44.1 kHz output
      '-ac', '1',            // Mono
      '-b:a', '64k',         // 64 kbps — good quality, small size
      '-f', 'mp3',           // Force MP3 output
      'pipe:1',              // Output to stdout
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe: piper stdout → ffmpeg stdin
    piper.stdout.pipe(ffmpeg.stdin);

    // Collect stderr for diagnostics
    let piperStderr = '';
    let ffmpegStderr = '';
    piper.stderr.on('data', (chunk: Buffer) => {
      piperStderr += chunk.toString();
    });
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      ffmpegStderr += chunk.toString();
    });

    let responded = false;

    const sendError = (msg: string) => {
      if (!responded) {
        responded = true;
        if (!res.headersSent) {
          res.status(500).json({ error: msg });
        } else {
          res.end();
        }
        reject(new Error(msg));
      }
    };

    piper.on('error', (err) => {
      console.error('[tts] piper error:', err);
      sendError('TTS engine unavailable');
    });

    ffmpeg.on('error', (err) => {
      console.error('[tts] ffmpeg error:', err);
      sendError('TTS audio processing failed');
    });

    // When piper finishes, close ffmpeg stdin so it can finalize
    piper.on('close', (code) => {
      if (code !== 0) {
        console.error(`[tts] piper exited ${code}:`, piperStderr);
        // Don't error here — text may still have been written, ffmpeg may still produce output
      }
      ffmpeg.stdin.end();
    });

    // Stream ffmpeg stdout (MP3) to the response
    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!responded) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        responded = true;
      }
      res.write(chunk);
    });

    ffmpeg.on('close', (code) => {
      if (!responded) {
        if (code !== 0) {
          console.error(`[tts] ffmpeg exited ${code}:`, ffmpegStderr);
          res.status(500).json({ error: 'TTS generation failed' });
          reject(new Error('TTS generation failed'));
        } else {
          res.status(500).json({ error: 'TTS produced no audio' });
          reject(new Error('TTS produced no audio'));
        }
      } else {
        res.end();
        resolve();
      }
    });

    // Clean up if client disconnects
    req.on('close', () => {
      if (!piper.killed) piper.kill();
      if (!ffmpeg.killed) ffmpeg.kill();
    });
  });
}

/**
 * Stream TTS audio via espeak-ng → ffmpeg → MP3 to the response.
 * Fallback engine — always available where espeak-ng is installed.
 */
function streamEspeakTts(
  req: Request,
  res: Response,
  text: string,
  voice?: string,
  rate?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // ── Stage 1: espeak-ng → WAV on stdout ─────────────────────
    const espeakArgs: string[] = [
      '--stdout',
      '-v', voice || 'en-us',
    ];

    if (rate !== undefined) {
      espeakArgs.push('-s', String(Math.max(80, Math.min(450, rate))));
    }

    espeakArgs.push('--', text);

    // ── Stage 2: ffmpeg normalization → MP3 ────────────────────
    const espeak = spawn('espeak-ng', espeakArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',          // Read WAV from espeak stdout
      '-acodec', 'libmp3lame',
      '-ar', '44100',
      '-ac', '1',
      '-b:a', '64k',
      '-f', 'mp3',
      'pipe:1',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    espeak.stdout.pipe(ffmpeg.stdin);

    let espeakStderr = '';
    let ffmpegStderr = '';
    espeak.stderr.on('data', (chunk: Buffer) => {
      espeakStderr += chunk.toString();
    });
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      ffmpegStderr += chunk.toString();
    });

    let responded = false;

    const sendError = (msg: string) => {
      if (!responded) {
        responded = true;
        if (!res.headersSent) {
          res.status(500).json({ error: msg });
        } else {
          res.end();
        }
        reject(new Error(msg));
      }
    };

    espeak.on('error', (err) => {
      console.error('[tts] espeak-ng error:', err);
      sendError('TTS engine unavailable');
    });

    ffmpeg.on('error', (err) => {
      console.error('[tts] ffmpeg error:', err);
      sendError('TTS audio processing failed');
    });

    espeak.on('close', (code) => {
      if (code !== 0) {
        console.error(`[tts] espeak-ng exited ${code}:`, espeakStderr);
      }
      ffmpeg.stdin.end();
    });

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!responded) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        responded = true;
      }
      res.write(chunk);
    });

    ffmpeg.on('close', (code) => {
      if (!responded) {
        if (code !== 0) {
          console.error(`[tts] ffmpeg exited ${code}:`, ffmpegStderr);
          res.status(500).json({ error: 'TTS generation failed' });
          reject(new Error('TTS generation failed'));
        } else {
          res.status(500).json({ error: 'TTS produced no audio' });
          reject(new Error('TTS produced no audio'));
        }
      } else {
        res.end();
        resolve();
      }
    });

    req.on('close', () => {
      if (!espeak.killed) espeak.kill();
      if (!ffmpeg.killed) ffmpeg.kill();
    });
  });
}
