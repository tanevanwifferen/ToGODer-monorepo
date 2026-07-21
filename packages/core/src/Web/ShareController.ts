import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { setAuthUser } from './Middleware/auth';
import { requireAdmin } from './AdminController';
import { ToGODerRequest } from './Model/ToGODerRequest';
import { ShareService } from '../Services/ShareService';
import { z } from 'zod';
import { ChatCompletionMessageParam } from 'openai/resources/index';

// Validation schemas
const instructionHistorySchema = z
  .array(
    z.object({
      content: z.string(),
      timestamp: z.number(),
      signature: z.string(),
    }),
  )
  .optional();

const shareRequestSchema = z.object({
  messages: z.array(
    z.object({
      message: z.object({
        role: z.string(),
        content: z.string(),
      }) as unknown as z.ZodType<ChatCompletionMessageParam>,
      signature: z.string(),
    }),
  ),
  title: z.string(),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  instructionHistory: instructionHistorySchema,
});

const shareArtifactRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  content: z.string(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  instructionHistory: instructionHistorySchema,
  artifactSignature: z.string().min(1, 'Artifact signature is required to prove AI authorship'),
});

const shareFolderRequestSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  artifactIds: z.array(z.string()).optional().default([]),
});

const addFolderItemSchema = z.object({
  artifactId: z.string(),
});

const paginationSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('50'),
});

/**
 * Controller for handling shared content operations.
 * Provides endpoints for sharing chats, artifacts, folders, and admin Payload publishing.
 */
export function GetShareRouter(
  messageLimiter: RateLimitRequestHandler,
): Router {
  const shareRouter = Router();
  const shareService = new ShareService();

  // ── Chat sharing ────────────────────────────────────────────────

  // Share a chat
  shareRouter.post(
    '/api/share',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const body = shareRequestSchema.parse(req.body);
        const sharedChat = await shareService.createSharedChat(
          body.messages,
          body.title,
          body.description,
          user,
          body.visibility,
          body.instructionHistory,
        );

        res.json(sharedChat);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        next(error);
      }
    },
  );

  // List shared chats with pagination
  shareRouter.get(
    '/api/share',
    messageLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { page, limit } = paginationSchema.parse(req.query);
        const result = await shareService.listSharedChats(page, limit);
        res.json(result);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: 'Invalid pagination parameters' });
          return;
        }
        next(error);
      }
    },
  );

  // Get a specific shared chat
  shareRouter.get(
    '/api/share/:id',
    messageLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const chat = await shareService.getSharedChat(req.params.id);
        if (!chat) {
          res.status(404).json({ error: 'Shared chat not found' });
          return;
        }
        res.json(chat);
      } catch (error) {
        next(error);
      }
    },
  );

  // Copy a shared chat to the authenticated user's own chats
  shareRouter.post(
    '/api/share/:id/copy',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const result = await shareService.copySharedChat(req.params.id, user);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // Delete a shared chat (only by owner)
  shareRouter.delete(
    '/api/share/:id',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        try {
          const success = await shareService.deleteSharedChat(
            req.params.id,
            user,
          );
          if (!success) {
            res.status(404).json({ error: 'Shared chat not found' });
            return;
          }
          res.status(200).json({ message: 'Shared chat deleted successfully' });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'Only the original sharer can delete this chat'
          ) {
            res.status(403).json({ error: error.message });
            return;
          }
          throw error;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  // ── Artifact sharing ────────────────────────────────────────────

  // Share an artifact (requires artifactSignature to reject human-authored content)
  shareRouter.post(
    '/api/share/artifact',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const body = shareArtifactRequestSchema.parse(req.body);
        const sharedArtifact = await shareService.createSharedArtifact(
          body.title,
          body.description,
          body.content,
          user,
          body.visibility,
          body.instructionHistory,
          body.artifactSignature,
        );

        res.json(sharedArtifact);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        next(error);
      }
    },
  );

  // Get a specific shared artifact
  shareRouter.get(
    '/api/share/artifact/:id',
    messageLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const artifact = await shareService.getSharedArtifact(req.params.id);
        if (!artifact) {
          res.status(404).json({ error: 'Shared artifact not found' });
          return;
        }
        res.json(artifact);
      } catch (error) {
        next(error);
      }
    },
  );

  // Delete a shared artifact (only by owner)
  shareRouter.delete(
    '/api/share/artifact/:id',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        try {
          const success = await shareService.deleteSharedArtifact(
            req.params.id,
            user,
          );
          if (!success) {
            res.status(404).json({ error: 'Shared artifact not found' });
            return;
          }
          res
            .status(200)
            .json({ message: 'Shared artifact deleted successfully' });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              'Only the original sharer can delete this artifact'
          ) {
            res.status(403).json({ error: error.message });
            return;
          }
          throw error;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  // Generate artifact signature — clients call this to get a server-issued
  // signature for AI-generated artifact content before sharing.
  shareRouter.post(
    '/api/share/artifact/sign',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const { title, content } = z
          .object({ title: z.string(), content: z.string() })
          .parse(req.body);

        const signature = shareService.generateArtifactSignature(
          title,
          content,
        );
        res.json({ signature });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        next(error);
      }
    },
  );

  // ── Folder sharing ──────────────────────────────────────────────

  // Create a shared folder
  shareRouter.post(
    '/api/share/folder',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const body = shareFolderRequestSchema.parse(req.body);
        const folder = await shareService.createSharedFolder(
          body.title,
          body.description,
          user,
          body.visibility,
          body.artifactIds,
        );
        res.json(folder);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        next(error);
      }
    },
  );

  // Get a specific shared folder
  shareRouter.get(
    '/api/share/folder/:id',
    messageLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const folder = await shareService.getSharedFolder(req.params.id);
        if (!folder) {
          res.status(404).json({ error: 'Shared folder not found' });
          return;
        }
        res.json(folder);
      } catch (error) {
        next(error);
      }
    },
  );

  // Delete a shared folder (only by owner)
  shareRouter.delete(
    '/api/share/folder/:id',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        try {
          const success = await shareService.deleteSharedFolder(
            req.params.id,
            user,
          );
          if (!success) {
            res.status(404).json({ error: 'Shared folder not found' });
            return;
          }
          res
            .status(200)
            .json({ message: 'Shared folder deleted successfully' });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              'Only the original sharer can delete this folder'
          ) {
            res.status(403).json({ error: error.message });
            return;
          }
          throw error;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  // Add an artifact to an existing shared folder
  shareRouter.post(
    '/api/share/folder/:id/items',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const { artifactId } = addFolderItemSchema.parse(req.body);
        const item = await shareService.addItemToSharedFolder(
          req.params.id,
          artifactId,
          user,
        );
        res.json(item);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        next(error);
      }
    },
  );

  // Remove an item from a shared folder
  shareRouter.delete(
    '/api/share/folder/:folderId/items/:itemId',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        const success = await shareService.removeItemFromSharedFolder(
          req.params.folderId,
          req.params.itemId,
          user,
        );
        if (!success) {
          res.status(404).json({ error: 'Folder item not found' });
          return;
        }
        res.json({ message: 'Item removed from folder' });
      } catch (error) {
        next(error);
      }
    },
  );

  // ── Admin Payload publishing (admin-gated, fetch-based) ──────────

  // GET /api/admin/payload — Payload pulls published content from togoder.
  // Payload calls this endpoint to discover new shared content. Admin only.
  shareRouter.get(
    '/api/admin/payload',
    messageLimiter,
    setAuthUser,
    requireAdmin,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const content = await shareService.getPayloadContent();
        res.json(content);
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/admin/payload/chat/:id/mark — Mark a chat as published to Payload
  shareRouter.post(
    '/api/admin/payload/chat/:id/mark',
    messageLimiter,
    setAuthUser,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await shareService.markChatPublishedToPayload(req.params.id);
        res.json({ message: 'Chat marked as published to Payload' });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/admin/payload/artifact/:id/mark — Mark an artifact as published
  shareRouter.post(
    '/api/admin/payload/artifact/:id/mark',
    messageLimiter,
    setAuthUser,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await shareService.markArtifactPublishedToPayload(req.params.id);
        res.json({ message: 'Artifact marked as published to Payload' });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/admin/payload/folder/:id/mark — Mark a folder as published
  shareRouter.post(
    '/api/admin/payload/folder/:id/mark',
    messageLimiter,
    setAuthUser,
    requireAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await shareService.markFolderPublishedToPayload(req.params.id);
        res.json({ message: 'Folder marked as published to Payload' });
      } catch (error) {
        next(error);
      }
    },
  );

  return shareRouter;
}
