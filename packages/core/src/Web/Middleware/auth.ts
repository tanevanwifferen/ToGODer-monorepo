import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { getDbContext } from '../../Entity/Database';
import { ToGODerAuth } from '../Model/ToGODerRequest';
import { serverLog } from '../../Services/ServerLogService';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined');
}

export const setAuthUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth: ToGODerAuth = {
      user: null,
    };
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      const { id, tokenVersion } = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload & { tokenVersion?: number };
      const db = getDbContext();
      const user = await db.user.findUnique({ where: { id } });
      // Only attach user if token version matches (old tokens without
      // tokenVersion default to 0).
      if (user && user.tokenVersion === (tokenVersion ?? 0)) {
        auth.user = user;
      }
    }
    Object.defineProperty(req, 'togoder_auth', {
      value: auth,
    });
    next();
  } catch (e) {
    console.log('authentication error', e);
    serverLog('warn', 'Auth: invalid token (setAuthUser)', {
      error: (e as Error)?.message ?? String(e),
    });
    res.status(401).json('Invalid token');
  }
};
export const authenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.headers.authorization) {
      serverLog('warn', 'Auth: missing authorization header');
      return res.status(401).json('Unauthorized');
    }

    const token = req.headers.authorization.split(' ')[1];
    const { date } = jwt.verify(token, process.env.JWT_SECRET!) as {
      date: number;
    };

    if (date < new Date().getTime() - 1000 * 60 * 60 * 24) {
      serverLog('warn', 'Auth: token expired (authenticated)');
      return res.status(401).json('Token expired');
    }

    next();
  } catch {
    serverLog('warn', 'Auth: token verification failed (authenticated)');
    res.status(401).json({ logout: true });
  }
};

export const authenticatedAsync = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.headers.authorization) return res.status(401).json('Unauthorized');

    const token = req.headers.authorization.split(' ')[1];
    const { id, date, tokenVersion } = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      date: number;
      tokenVersion?: number;
    };

    if (date < new Date().getTime() - 1000 * 60 * 60 * 24) {
      return res.status(401).json('Token expired');
    }

    // Check that the token version matches the current user's version.
    // Old tokens without tokenVersion default to 0.
    const db = getDbContext();
    const user = await db.user.findUnique({ where: { id } });
    if (!user || user.tokenVersion !== (tokenVersion ?? 0)) {
      serverLog('warn', 'Auth: token version mismatch (authenticatedAsync)', {
        userId: id,
      });
      return res.status(401).json({ logout: true });
    }

    next();
  } catch {
    serverLog('warn', 'Auth: token verification failed (authenticatedAsync)');
    res.status(401).json({ logout: true });
  }
};

export const onlyOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.headers.authorization) return res.status(401).json('Unauthorized');

    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      date: number;
      tokenVersion?: number;
    };

    // Verify the token belongs to the user and hasn't expired
    if (
      decodedToken.id !== req.body.userId ||
      decodedToken.date < new Date().getTime() - 1000 * 60 * 60 * 24
    ) {
      return res.status(401).json('nope');
    }

    // Check token version matches current user version
    const db = getDbContext();
    const user = await db.user.findUnique({ where: { id: decodedToken.id } });
    if (!user || user.tokenVersion !== (decodedToken.tokenVersion ?? 0)) {
      return res.status(401).json('nope');
    }

    next();
  } catch {
    res.status(401).json('Unauthorized');
  }
};
