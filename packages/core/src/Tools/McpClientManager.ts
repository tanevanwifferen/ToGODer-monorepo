import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@prisma/client';
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions';
import { checkUrl } from '../Services/McpSsrfGuard';

/**
 * Descriptor for a single MCP tool, as exposed to the rest of the backend
 * (the tool registry / chat loop). The namespaced name is what the LLM sees
 * in its tool list and what it returns in a tool_call; we route by it.
 */
export interface McpToolDescriptor {
  serverId: string;
  serverName: string;
  serverSlug: string;
  toolName: string;
  namespacedName: string;
  description: string;
  inputSchema: any;
}

/**
 * Minimal user shape we depend on. We only need the id (to key cache entries
 * per server id, which is already user-scoped) and the email (to decide the
 * SSRF bypass for tanevanwifferen@gmail.com).
 */
export interface McpUser {
  id: string;
  email: string;
}

/** An OpenAI-style function tool definition derived from an MCP tool. */
export type McpChatCompletionTool = ChatCompletionTool;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CALL_TOOL_TIMEOUT_MS =
  (process.env.MCP_TOOL_TIMEOUT_MS ? parseInt(process.env.MCP_TOOL_TIMEOUT_MS, 10) : 0) ||
  30 * 60 * 1000; // default 30 min; configurable via env
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour — completed/failed jobs kept for polling
const JOB_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // prune expired jobs every 5 min

interface CachedConnection {
  client: Client;
  /** toolName -> McpToolDescriptor (for dispatch + description reuse) */
  tools: Map<string, McpToolDescriptor>;
  expiresAt: number;
}

/** Status of an async MCP tool job. */
export interface McpJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  toolName: string;
  serverName: string;
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * Singleton managing cached MCP Client connections (one per McpServer.id)
 * over the Streamable HTTP transport. Lazily connects, lists tools, converts
 * them to OpenAI-style function tool defs, and dispatches namespaced tool
 * calls back to the owning server.
 *
 * Security: every URL is run through the SSRF guard (../Services/McpSsrfGuard)
 * BEFORE connecting and BEFORE every callTool. The bypass is granted only for
 * the configured operator email (tanevanwifferen@gmail.com). Blocked servers
 * are silently skipped when listing tools and explicitly rejected (thrown)
 * when dispatching a call.
 */
class McpClientManager {
  private readonly cache = new Map<string, CachedConnection>();
  private readonly jobs = new Map<string, McpJobStatus>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Connect (or reuse a cached client) and return the OpenAI-style tool defs
   * for all reachable, enabled servers belonging to the user. Skips blocked or
   * unreachable servers (returns an empty contribution for those). Never
   * throws for an individual server; the union of all servers' tools is returned.
   */
  async getToolsForUser(user: McpUser, servers: McpServer[]): Promise<McpChatCompletionTool[]> {
    const descriptors = await this.listToolsForUser(user, servers);
    return descriptors.map((d) => ({
      type: 'function' as const,
      function: {
        name: d.namespacedName,
        description: `${d.toolName} (via MCP server ${d.serverName}): ${d.description}`,
        parameters: d.inputSchema && Object.keys(d.inputSchema).length > 0 ? d.inputSchema : {},
      },
    }));
  }

  /**
   * Resolve the MCP tool descriptors for a user's servers. Exposed so callers
   * that need the structured descriptor (rather than the OpenAI tool def) can
   * use it. Skips blocked/unreachable servers.
   */
  async listToolsForUser(user: McpUser, servers: McpServer[]): Promise<McpToolDescriptor[]> {
    const enabled = servers.filter((s) => s.enabled);
    const results = await Promise.all(
      enabled.map((s) => this.listToolsForServer(user, s).catch(() => [])),
    );
    return results.flat();
  }

  /**
   * Dispatch a namespaced tool call to the owning MCP server and return the
   * result as a single string (concatenated text content, non-text blocks
   * JSON-stringified) suitable to feed back to the LLM.
   *
   * Throws on: unknown namespaced tool, SSRF block, connect failure, or server
   * error. Applies a 10-minute timeout so heavy MCP tools can complete without
   * being cut off prematurely.
   */
  async callTool(
    user: McpUser,
    servers: McpServer[],
    namespacedName: string,
    args: Record<string, any>,
  ): Promise<string> {
    const descriptor = await this.findDescriptor(user, servers, namespacedName);
    if (!descriptor) {
      throw new Error(`MCP tool not found: ${namespacedName}`);
    }
    const server = servers.find((s) => s.id === descriptor.serverId);
    if (!server) {
      throw new Error(`MCP server not found for tool: ${namespacedName}`);
    }

    // Re-validate the URL before every call (config may have changed, or the
    // server's DNS may have re-pointed at a private IP since connect time).
    const ssrf = await checkUrl(server.url, {
      bypassPrivateBlock: user.email === 'tanevanwifferen@gmail.com',
    });
    if (!ssrf.ok) {
      console.warn(
        `[McpClientManager] callTool blocked by SSRF guard: server ${server.id} (${server.name}) tool ${descriptor.toolName}`,
      );
      throw new Error(`MCP server blocked by SSRF guard: ${server.name}`);
    }

    const entry = await this.getOrCreateConnection(user, server).catch((err) => {
      console.warn(
        `[McpClientManager] callTool connect failed: server ${server.id} (${server.name}) tool ${descriptor.toolName}`,
        err instanceof Error ? err.message : err,
      );
      throw new Error(`MCP server unreachable: ${server.name}`);
    });

    return this.callToolWithTimeout(entry.client, descriptor.toolName, args);
  }

  /**
   * Dispatch an MCP tool call asynchronously. Returns a job ID immediately;
   * the tool runs in the background. Poll with getJobStatus() for the result.
   */
  callToolAsync(
    user: McpUser,
    servers: McpServer[],
    namespacedName: string,
    args: Record<string, any>,
  ): McpJobStatus {
    const jobId = this.generateJobId();
    const toolName = namespacedName;
    const serverName = servers[0]?.name ?? 'unknown';
    const now = Date.now();

    const job: McpJobStatus = {
      jobId,
      status: 'pending',
      toolName,
      serverName,
      createdAt: now,
    };
    this.jobs.set(jobId, job);
    this.ensureCleanup();

    // Fire and forget — run in background
    this.executeJob(jobId, user, servers, namespacedName, args).catch((err) => {
      console.error(`[McpClientManager] async job ${jobId} unhandled error:`, err);
    });

    return job;
  }

  /**
   * Poll for the status/result of an async MCP tool job. Returns undefined
   * if the job ID is unknown (expired or never existed).
   */
  getJobStatus(jobId: string): McpJobStatus | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    // Auto-cleanup expired jobs on read
    if (Date.now() - job.createdAt > JOB_TTL_MS) {
      this.jobs.delete(jobId);
      return undefined;
    }
    return job;
  }

  /**
   * Drop the cached connection for a server id (e.g. on config change or
   * deletion). Closes the client if possible. Safe to call with an unknown id.
   */
  invalidate(serverId: string): void {
    const entry = this.cache.get(serverId);
    if (!entry) return;
    this.cache.delete(serverId);
    entry.client.close().catch(() => {
      /* best-effort close; ignore errors on teardown */
    });
  }

  // -------------------------------------------------------------------------

  private async listToolsForServer(user: McpUser, server: McpServer): Promise<McpToolDescriptor[]> {
    const ssrf = await checkUrl(server.url, {
      bypassPrivateBlock: user.email === 'tanevanwifferen@gmail.com',
    });
    if (!ssrf.ok) {
      console.warn(
        `[McpClientManager] getTools blocked by SSRF guard: server ${server.id} (${server.name})`,
      );
      return [];
    }
    const entry = await this.getOrCreateConnection(user, server).catch((err) => {
      console.warn(
        `[McpClientManager] getTools connect failed: server ${server.id} (${server.name})`,
        err instanceof Error ? err.message : err,
      );
      return null;
    });
    if (!entry) return [];
    return Array.from(entry.tools.values());
  }

  private async findDescriptor(
    user: McpUser,
    servers: McpServer[],
    namespacedName: string,
  ): Promise<McpToolDescriptor | null> {
    for (const server of servers) {
      if (!server.enabled) continue;
      const entry = await this.getOrCreateConnection(user, server).catch(() => null);
      if (entry && entry.tools.has(namespacedName)) {
        return entry.tools.get(namespacedName) ?? null;
      }
    }
    return null;
  }

  private async getOrCreateConnection(
    user: McpUser,
    server: McpServer,
  ): Promise<CachedConnection> {
    // The cache is keyed by server id, which is globally unique; the user is
    // only consulted for the SSRF bypass decision (validated before connect).
    void user;
    const now = Date.now();
    const existing = this.cache.get(server.id);
    if (existing && existing.expiresAt > now) {
      return existing;
    }
    // Expired or missing — clear and (re)connect fresh.
    if (existing) {
      this.cache.delete(server.id);
      existing.client.close().catch(() => {});
    }

    const headers = this.parseHeaders(server.headersJson);
    const requestInit: RequestInit = {
      headers,
    };

    // Note: even though core compiles to CommonJS, the MCP SDK's package.json
    // `exports` map routes require() to its CJS build (dist/cjs), so static
    // imports of the `.js` subpaths resolve at runtime without a dynamic
    // import() workaround under Node 20+.
    const transport = new StreamableHTTPClientTransport(new URL(server.url), { requestInit });
    const client = new Client(
      { name: 'togoder-mcp-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(transport);

    const result = await client.listTools();
    const tools = new Map<string, McpToolDescriptor>();
    const slug = this.slugify(server);
    for (const tool of result.tools) {
      const namespacedName = this.namespacedName(slug, tool.name, server.id);
      tools.set(namespacedName, {
        serverId: server.id,
        serverName: server.name,
        serverSlug: slug,
        toolName: tool.name,
        namespacedName,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? {},
      });
    }

    const entry: CachedConnection = {
      client,
      tools,
      expiresAt: now + CACHE_TTL_MS,
    };
    this.cache.set(server.id, entry);
    return entry;
  }

  private async callToolWithTimeout(
    client: Client,
    toolName: string,
    args: Record<string, any>,
  ): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`MCP tool call timed out after ${CALL_TOOL_TIMEOUT_MS}ms: ${toolName}`)),
        CALL_TOOL_TIMEOUT_MS,
      );
    });
    try {
      // The SDK's callTool return type is a complex zod-inferred union with an
      // index signature; cast to a loose shape so we can read `content` without
      // fighting its narrow (and version-sensitive) structure.
      const result = (await Promise.race([
        client.callTool({ name: toolName, arguments: args }),
        timeout,
      ])) as { content?: Array<Record<string, unknown>> };
      return this.resultToString(result);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Convert an MCP CallToolResult (content array) into a single string:
   * concatenate `text` blocks verbatim, JSON-stringify any non-text blocks.
   * Empty content arrays produce an empty string.
   */
  private resultToString(result: { content?: Array<Record<string, unknown>> }): string {
    const content = result?.content;
    if (!Array.isArray(content)) return '';
    const parts: string[] = [];
    for (const block of content) {
      if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      } else {
        parts.push(JSON.stringify(block));
      }
    }
    return parts.join('\n');
  }

  /** Parse headersJson into a Headers-like record; never throws. */
  private parseHeaders(headersJson: string): Record<string, string> {
    try {
      const parsed = JSON.parse(headersJson || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') out[k] = v;
          else out[k] = String(v);
        }
        return out;
      }
    } catch {
      // Malformed headers — fall through to empty. Never log values.
    }
    return {};
  }

  /**
   * Build a tool-name namespace `mcp__<serverSlug>__<toolName>`. The slug is
   * derived from the server name: lowercased, spaces -> underscores, stripped
   * of any char outside [a-z0-9_]. Collisions across a user's servers are
   * guarded by appending a short hash of the server id if needed.
   */
  private slugify(server: McpServer): string {
    const base =
      server.name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '') || 'server';
    return base.length > 0 ? base : 'server';
  }

  private namespacedName(slug: string, toolName: string, serverId: string): string {
    const base = `mcp__${slug}__${toolName}`;
    // Disambiguate potential collisions by suffixing a short server-id hash.
    // We always include the suffix deterministically so the same server+tool
    // always maps to the same name within a session.
    const hash = this.shortHash(serverId);
    return `${base}__${hash}`;
  }

  private async executeJob(
    jobId: string,
    user: McpUser,
    servers: McpServer[],
    namespacedName: string,
    args: Record<string, any>,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'running';

    try {
      const result = await this.callTool(user, servers, namespacedName, args);
      job.status = 'complete';
      job.result = result;
      job.completedAt = Date.now();
    } catch (err: any) {
      job.status = 'error';
      job.error = err?.message ?? String(err);
      job.completedAt = Date.now();
    }
  }

  private generateJobId(): string {
    const rand = Array.from({ length: 8 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)),
    ).join('');
    return `mcp_${rand}`;
  }

  private ensureCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, job] of this.jobs) {
        if (now - job.createdAt > JOB_TTL_MS) {
          this.jobs.delete(id);
        }
      }
      if (this.jobs.size === 0 && this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, JOB_CLEANUP_INTERVAL_MS);
    // Allow the timer to not block process exit
    if (this.cleanupTimer && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /** Stable short hash (base36) of a string — used only for name disambiguation. */
  private shortHash(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }
}

let manager: McpClientManager | undefined;

/** Get the shared McpClientManager singleton. */
export function getMcpClientManager(): McpClientManager {
  if (!manager) manager = new McpClientManager();
  return manager;
}
