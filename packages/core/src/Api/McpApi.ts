import { McpServer, User } from '@prisma/client';
import { getDbContext } from '../Entity/Database';
import { checkUrl } from '../Services/McpSsrfGuard';
import { getMcpClientManager } from '../Tools/McpClientManager';

/** Maximum number of MCP servers a single user may configure. */
export const MAX_MCP_SERVERS_PER_USER = 10;

/** Public-facing representation of an MCP server — headers are masked. */
export interface McpServerPublicView {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  hasHeaders: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CRUD service over the Prisma `mcpServer` table, scoped to a single user.
 *
 * Security: every url is run through the SSRF guard before create/update
 * (the bypass is granted only for tanevanwifferen@gmail.com). Header values
 * are never returned — only a `hasHeaders` boolean. The MCP client cache is
 * invalidated whenever a server's url/headers change or it is deleted.
 */
export class McpApi {
  /** List all MCP servers belonging to `user`, with headers masked. */
  async listForUser(user: User): Promise<McpServerPublicView[]> {
    const rows = await getDbContext().mcpServer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toPublicView(r));
  }

  /**
   * Create a new MCP server for `user`. Enforces the per-user cap and runs
   * the SSRF guard on the url. Returns the public view or throws an Error with
   * a user-facing message on cap/SSRF failure.
   */
  async create(
    user: User,
    data: { name: string; url: string; headers?: Record<string, string>; enabled?: boolean }
  ): Promise<McpServerPublicView> {
    const count = await getDbContext().mcpServer.count({
      where: { userId: user.id },
    });
    if (count >= MAX_MCP_SERVERS_PER_USER) {
      throw new Error(
        `You can configure at most ${MAX_MCP_SERVERS_PER_USER} MCP servers.`
      );
    }

    const ssrf = await checkUrl(data.url, {
      bypassPrivateBlock: user.email === 'tanevanwifferen@gmail.com',
    });
    if (!ssrf.ok) {
      console.warn(
        `[McpApi] create SSRF rejected: user ${user.id} name "${data.name}"`
      );
      throw new Error(`Blocked URL: ${ssrf.reason ?? 'disallowed address'}`);
    }

    const headersJson = JSON.stringify(data.headers ?? {});
    const created = await getDbContext().mcpServer.create({
      data: {
        userId: user.id,
        name: data.name,
        url: data.url,
        headersJson,
        enabled: data.enabled ?? true,
      },
    });
    console.log(
      `[McpApi] create: user ${user.id} server ${created.id} name "${created.name}"`
    );
    return this.toPublicView(created);
  }

  /**
   * Update an MCP server owned by `user`. Ownership is enforced (returns null
   * when the server does not exist or belongs to someone else, so the caller
   * can respond 404 without leaking existence). Re-runs the SSRF guard when
   * the url changes. Invalidates the MCP client cache on url/headers change.
   *
   * Headers contract: if `headers` is omitted (undefined), the existing
   * headers are PRESERVED. If `headers` is provided (including an empty
   * object {}), the stored headers are REPLACED with the new value.
   */
  async update(
    user: User,
    id: string,
    data: { name?: string; url?: string; headers?: Record<string, string>; enabled?: boolean }
  ): Promise<McpServerPublicView | null> {
    const existing = await this.findOwned(user, id);
    if (!existing) return null;

    let headersJson: string | undefined;
    let invalidate = false;

    if (data.url !== undefined && data.url !== existing.url) {
      const ssrf = await checkUrl(data.url, {
        bypassPrivateBlock: user.email === 'tanevanwifferen@gmail.com',
      });
      if (!ssrf.ok) {
        console.warn(
          `[McpApi] update SSRF rejected: user ${user.id} server ${id} name "${existing.name}"`
        );
        throw new Error(`Blocked URL: ${ssrf.reason ?? 'disallowed address'}`);
      }
      invalidate = true;
    }

    if (data.headers !== undefined) {
      // Provided (even empty {}) => REPLACE. Omitted => preserve (no write).
      headersJson = JSON.stringify(data.headers);
      invalidate = true;
    }

    const updated = await getDbContext().mcpServer.update({
      where: { id },
      data: {
        name: data.name,
        url: data.url,
        headersJson,
        enabled: data.enabled,
      },
    });

    if (invalidate) {
      getMcpClientManager().invalidate(id);
    }
    console.log(
      `[McpApi] update: user ${user.id} server ${id} name "${updated.name}"`
    );
    return this.toPublicView(updated);
  }

  /**
   * Delete an MCP server owned by `user`. Returns true on success, false if
   * not owned (caller responds 404). Invalidates the MCP client cache.
   */
  async delete(user: User, id: string): Promise<boolean> {
    const existing = await this.findOwned(user, id);
    if (!existing) return false;
    await getDbContext().mcpServer.delete({ where: { id } });
    getMcpClientManager().invalidate(id);
    console.log(
      `[McpApi] delete: user ${user.id} server ${id} name "${existing.name}"`
    );
    return true;
  }

  /** Fetch a server iff it belongs to `user`; otherwise null. */
  private async findOwned(user: User, id: string): Promise<McpServer | null> {
    return getDbContext().mcpServer.findFirst({
      where: { id, userId: user.id },
    });
  }

  /** Mask header values: expose only whether any headers are present. */
  private toPublicView(row: McpServer): McpServerPublicView {
    let hasHeaders = false;
    try {
      const parsed = JSON.parse(row.headersJson || '{}');
      hasHeaders =
        !!parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length > 0;
    } catch {
      hasHeaders = false;
    }
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      enabled: row.enabled,
      hasHeaders,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
