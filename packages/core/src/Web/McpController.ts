import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { z } from 'zod';
import { setAuthUser } from './Middleware/auth';
import { ToGODerRequest } from './Model/ToGODerRequest';
import { McpApi } from '../Api/McpApi';

/**
 * MCP server config URL: must be an http(s) URL. The SSRF guard double-checks
 * the scheme and the resolved address, but we reject obviously non-http(s)
 * values here so malformed input never reaches it.
 */
const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => u.startsWith('http://') || u.startsWith('https://'),
    { message: 'url must be an http(s) URL' }
  );

const createSchema = z.object({
  name: z.string().min(1).max(60),
  url: httpUrl,
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  url: httpUrl.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Controller for the per-user MCP server config REST API.
 * All routes require authentication (setAuthUser + 401 if no user) and are
 * scoped to the authed user. Header values are never returned (only a
 * hasHeaders boolean) and never logged.
 */
export function GetMcpRouter(messageLimiter: RateLimitRequestHandler): Router {
  const mcpRouter = Router();
  const mcpApi = new McpApi();

  // GET /api/mcp/servers — list the authed user's MCP servers (headers masked)
  mcpRouter.get(
    '/api/mcp/servers',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const servers = await mcpApi.listForUser(user);
        res.json(servers);
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/mcp/servers — create (zod + cap + SSRF on save)
  mcpRouter.post(
    '/api/mcp/servers',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const body = createSchema.parse(req.body);
        const created = await mcpApi.create(user, body);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        if (error instanceof Error) {
          // Cap-exceeded / SSRF-rejected messages are user-facing 400s.
          if (
            error.message.startsWith('Blocked URL:') ||
            error.message.includes('at most')
          ) {
            res.status(400).json({ error: error.message });
            return;
          }
        }
        next(error);
      }
    }
  );

  // PUT /api/mcp/servers/:id — update (ownership 404, SSRF on url change,
  // cache invalidate on url/headers change, headers preserve-vs-replace)
  mcpRouter.put(
    '/api/mcp/servers/:id',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const id = req.params.id;
        const body = updateSchema.parse(req.body);
        const updated = await mcpApi.update(user, id, body);
        if (!updated) {
          // 404 (not 403) to avoid leaking existence across users.
          res.status(404).json({ error: 'MCP server not found' });
          return;
        }
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json({ error: 'Invalid request data', details: error.errors });
          return;
        }
        if (error instanceof Error && error.message.startsWith('Blocked URL:')) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    }
  );

  // DELETE /api/mcp/servers/:id — delete (ownership 404, cache invalidate)
  mcpRouter.delete(
    '/api/mcp/servers/:id',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = (req as ToGODerRequest).togoder_auth?.user;
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const id = req.params.id;
        const deleted = await mcpApi.delete(user, id);
        if (!deleted) {
          res.status(404).json({ error: 'MCP server not found' });
          return;
        }
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );

  return mcpRouter;
}
