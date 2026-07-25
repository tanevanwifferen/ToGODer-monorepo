import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { spawn } from 'child_process';

/**
 * Controller for Text-to-Speech using espeak-ng.
 *
 * Accepts text via POST /api/tts and returns WAV audio streamed via
 * chunked transfer encoding. espeak-ng is a tiny CPU-only TTS engine
 * (~2MB installed, no models to download).
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

        // Sanity cap to prevent abuse — 5000 chars is ~5 min of speech
        const safeText = text.slice(0, 5000);

        const args: string[] = [
          '--stdout',            // Write WAV to stdout
          '-v', voice || 'en-us', // Voice (en-us, en-uk, etc.)
        ];

        if (rate !== undefined) {
          // espeak-ng rate: words per minute, default ~175, range 80-450
          args.push('-s', String(Math.max(80, Math.min(450, rate))));
        }

        // Pipe text via stdin to avoid shell escaping issues
        args.push('--');  // End of options
        args.push(safeText);

        const proc = spawn('espeak-ng', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Stream stdout to response
        proc.stdout.pipe(res);

        // Handle stderr for diagnostics
        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('error', (err) => {
          console.error('[tts] espeak-ng spawn error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'TTS engine unavailable' });
          } else {
            res.end();
          }
        });

        proc.on('close', (code) => {
          if (stderr && code !== 0) {
            console.warn(`[tts] espeak-ng stderr (code ${code}):`, stderr);
          }
          if (!res.headersSent) {
            res.status(500).json({ error: 'TTS generation failed' });
          }
        });

        // Clean up if client disconnects
        req.on('close', () => {
          if (!proc.killed) {
            proc.kill();
          }
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
