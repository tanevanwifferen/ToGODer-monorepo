import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { setAuthUser } from './Middleware/auth';
import { ToGODerRequest } from './Model/ToGODerRequest';
import { getDbContext } from '../Entity/Database';
import { Expo } from 'expo-server-sdk';

export function GetPushRouter(messageLimiter: RateLimitRequestHandler): Router {
  const router = Router();

  /**
   * POST /api/push/register
   * Register an Expo Push Token for the authenticated user.
   * Body: { token: string, platform?: "ios" | "android" | "web" }
   */
  router.post(
    '/api/push/register',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const { token, platform } = req.body;

        if (!token || typeof token !== 'string') {
          res.status(400).json({ error: 'token is required and must be a string' });
          return;
        }

        if (!Expo.isExpoPushToken(token)) {
          res.status(400).json({
            error: 'Invalid Expo push token. Must start with "ExponentPushToken[" or "ExpoPushToken["',
          });
          return;
        }

        const db = getDbContext();

        // Upsert: create or update last-used timestamp
        const existing = await db.pushToken.findUnique({ where: { token } });

        if (existing) {
          // Token exists — ensure it's associated with the current user
          if (existing.userId !== user.id) {
            // Token was registered to a different user; reassign
            await db.pushToken.update({
              where: { id: existing.id },
              data: { userId: user.id, platform: platform || 'ios' },
            });
          } else {
            // Same user — just touch the timestamp
            await db.pushToken.update({
              where: { id: existing.id },
              data: { platform: platform || existing.platform },
            });
          }
        } else {
          await db.pushToken.create({
            data: {
              userId: user.id,
              token,
              platform: platform || 'ios',
            },
          });
        }

        console.log(`[push] Token registered for user ${user.id}: ${token.slice(0, 20)}...`);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/push/unregister
   * Remove an Expo Push Token for the authenticated user.
   * Body: { token: string }
   */
  router.post(
    '/api/push/unregister',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const { token } = req.body;
        if (!token || typeof token !== 'string') {
          res.status(400).json({ error: 'token is required and must be a string' });
          return;
        }

        const db = getDbContext();
        await db.pushToken.deleteMany({
          where: { token, userId: user.id },
        });

        console.log(`[push] Token unregistered for user ${user.id}`);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}