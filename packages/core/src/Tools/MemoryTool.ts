import { ToolRegistry } from './ToolRegistry';
import { ChatRequest } from '../Model/ChatRequest';
import { getDbContext } from '../Entity/Database';

/**
 * Pending client-side memory operation queued by a conscious tool.
 * The streaming service drains this queue after each backend tool execution
 * and emits SSE events so the client can persist the mutation.
 */
export interface PendingMemoryOp {
  type: 'write' | 'delete';
  key: string;
  value?: string; // only for write
}

/**
 * Drain pending memory operations from a request and return them.
 * Operations are stored on the request object itself so concurrent
 * streaming requests never mix up their memory mutations.
 */
export function drainMemoryOps(request: ChatRequest): PendingMemoryOp[] {
  const ops = request._pendingMemoryOps ?? [];
  request._pendingMemoryOps = [];
  return ops;
}

function enqueueMemoryOp(request: ChatRequest, op: PendingMemoryOp): void {
  if (!request._pendingMemoryOps) {
    request._pendingMemoryOps = [];
  }
  request._pendingMemoryOps.push(op);
}

/**
 * Register the 4 conscious memory tools.
 *
 * Tools run server-side but read from the ChatRequest's memoryIndex /
 * memories fields, which the client populates from its local storage.
 * Write and delete operations are queued via MemoryToolOps so the
 * streaming service can emit events back to the client for persistence.
 */
export function registerMemoryTools(): void {
  const registry = ToolRegistry.getInstance();

  // ── list_memory_keys ─────────────────────────────────────────────
  registry.register(
    'list_memory_keys',
    {
      type: 'function',
      function: {
        name: 'list_memory_keys',
        description:
          'List all memory keys currently stored for the user. ' +
          'Use this to discover what memories exist before reading or modifying them.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    async (ctx) => {
      const keys = ctx.request.memoryIndex ?? [];
      if (keys.length === 0) {
        return 'No memories found for this user.';
      }
      return JSON.stringify({ keys, count: keys.length });
    },
  );

  // ── read_memory ──────────────────────────────────────────────────
  registry.register(
    'read_memory',
    {
      type: 'function',
      function: {
        name: 'read_memory',
        description:
          'Read the content of a specific memory by its key. ' +
          'Use list_memory_keys first to discover available keys.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The memory key to read (e.g. "/user/name")',
            },
          },
          required: ['key'],
        },
      },
    },
    async (ctx) => {
      const key = ctx.arguments.key as string;
      if (!key || typeof key !== 'string') {
        return 'Error: key parameter is required and must be a string.';
      }

      const memories = ctx.request.memories ?? {};
      if (key in memories) {
        return JSON.stringify({ key, value: memories[key] });
      }

      // Fall back to server-side store (enables cross-session memory reads)
      if (ctx.request._userId) {
        try {
          const db = getDbContext();
          const serverMem = await db.serverMemory.findUnique({
            where: { userId_key: { userId: ctx.request._userId, key } },
          });
          if (serverMem) {
            // Cache it in-memory for the rest of this request
            ctx.request.memories[key] = serverMem.value;
            return JSON.stringify({ key, value: serverMem.value });
          }
        } catch (err) {
          console.error(`[memory] Server-side read failed for key "${key}":`, err);
        }
      }

      // The key exists in the index but wasn't fetched yet.
      // Signal the model to request it via memory_request flow.
      const memoryIndex = ctx.request.memoryIndex ?? [];
      if (memoryIndex.includes(key)) {
        return (
          `Memory "${key}" exists but its content has not been fetched yet. ` +
          `The subconscious memory layer will fetch it on the next request. ` +
          `Ask the user to continue the conversation and try again.`
        );
      }

      return `Memory "${key}" not found. Use list_memory_keys to see available keys.`;
    },
  );

  // ── write_memory ─────────────────────────────────────────────────
  registry.register(
    'write_memory',
    {
      type: 'function',
      function: {
        name: 'write_memory',
        description:
          'Create or update a memory entry. The value will be persisted ' +
          'to the client-side memory store. Use this to remember facts ' +
          'about the user, decisions made, or context for future conversations.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The memory key to write (e.g. "/user/preferences"). ' +
                'Use path-like keys prefixed with / for organization.',
            },
            value: {
              type: 'string',
              description: 'The content to store for this memory key.',
            },
          },
          required: ['key', 'value'],
        },
      },
    },
    async (ctx) => {
      const key = ctx.arguments.key as string;
      const value = ctx.arguments.value as string;

      if (!key || typeof key !== 'string') {
        return 'Error: key parameter is required and must be a string.';
      }
      if (value === undefined || value === null) {
        return 'Error: value parameter is required.';
      }

      // Queue the client-side write
      enqueueMemoryOp(ctx.request, { type: 'write', key, value: String(value) });

      // Update in-memory memories immediately so that read_memory can
      // return the content within the same request (and in subsequent
      // tool-loop iterations). The client-side persistence handles
      // cross-request durability.
      ctx.request.memories[key] = String(value);

      // Also persist server-side so the WakeupService can read memories
      // without the client being connected.
      if (ctx.request._userId) {
        try {
          const db = getDbContext();
          await db.serverMemory.upsert({
            where: { userId_key: { userId: ctx.request._userId, key } },
            create: { userId: ctx.request._userId, key, value: String(value) },
            update: { value: String(value) },
          });
        } catch (err) {
          console.error(`[memory] Server-side persist failed for key "${key}":`, err);
        }
      }

      return `Memory "${key}" has been written.`;
    },
  );

  // ── delete_memory ────────────────────────────────────────────────
  registry.register(
    'delete_memory',
    {
      type: 'function',
      function: {
        name: 'delete_memory',
        description:
          'Delete a memory entry by its key. The deletion is persisted ' +
          'to the client-side memory store. Use with caution.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The memory key to delete (e.g. "/user/old-preference")',
            },
          },
          required: ['key'],
        },
      },
    },
    async (ctx) => {
      const key = ctx.arguments.key as string;
      if (!key || typeof key !== 'string') {
        return 'Error: key parameter is required and must be a string.';
      }

      // Queue the client-side delete
      enqueueMemoryOp(ctx.request, { type: 'delete', key });

      // Also remove from server-side store
      if (ctx.request._userId) {
        try {
          const db = getDbContext();
          await db.serverMemory.deleteMany({
            where: { userId: ctx.request._userId, key },
          });
        } catch (err) {
          console.error(`[memory] Server-side delete failed for key "${key}":`, err);
        }
      }

      return `Memory "${key}" has been queued for deletion. The client will persist it.`;
    },
  );
}
