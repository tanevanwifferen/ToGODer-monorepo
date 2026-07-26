import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { spawn } from 'child_process';

/**
 * Controller for Text-to-Speech using espeak-ng + ffmpeg normalization.
 *
 * Accepts text via POST /api/tts and returns MP3 audio. Pipeline:
 *   espeak-ng --stdout → raw PCM WAV
 *   → ffmpeg pipe:0 → MP3 (44100 Hz mono, universally playable)
 *
 * espeak-ng is a tiny CPU-only TTS engine (~2MB, no models).
 * ffmpeg normalizes the output to a guaranteed-playable MP3 format,
 * resolving the silence-on-playback bug where raw PCM WAV from
 * espeak-ng wasn't compatible with all browser audio APIs.
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

        // ── Stage 1: espeak-ng → raw PCM WAV on stdout ──────────
        const espeakArgs: string[] = [
          '--stdout',
          '-v', voice || 'en-us',
        ];

        if (rate !== undefined) {
          espeakArgs.push('-s', String(Math.max(80, Math.min(450, rate))));
        }

        espeakArgs.push('--', safeText);

        // ── Stage 2: ffmpeg normalization → MP3 ─────────────────
        // Pipe espeak stdout (PCM WAV) through ffmpeg to produce MP3.
        // 44100 Hz, mono, constant bitrate 64k — universally playable.
        const espeak = spawn('espeak-ng', espeakArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const ffmpeg = spawn('ffmpeg', [
          '-i', 'pipe:0',          // Read WAV from espeak stdout
          '-acodec', 'libmp3lame', // MP3 encoder
          '-ar', '44100',          // 44.1 kHz (standard)
          '-ac', '1',              // Mono
          '-b:a', '64k',           // 64 kbps — decent quality, small size
          '-f', 'mp3',             // Force MP3 output
          'pipe:1',                // Output to stdout
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Pipe: espeak stdout → ffmpeg stdin
        espeak.stdout.pipe(ffmpeg.stdin);

        // Collect stderr from both for diagnostics
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

        // When espeak finishes, close ffmpeg stdin so it can finalize
        espeak.on('close', (code) => {
          if (code !== 0) {
            console.error(`[tts] espeak-ng exited ${code}:`, espeakStderr);
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
            } else {
              res.status(500).json({ error: 'TTS produced no audio' });
            }
          } else {
            res.end();
          }
        });

        // Clean up if client disconnects
        req.on('close', () => {
          if (!espeak.killed) espeak.kill();
          if (!ffmpeg.killed) ffmpeg.kill();
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
