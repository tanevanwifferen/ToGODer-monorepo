import { ApiClient } from './ApiClient';

/**
 * Public representation of an MCP server, as returned by the backend. Note
 * that header VALUES are never returned — only `hasHeaders` (boolean). The
 * server is the source of truth; the client never stores header values.
 */
export interface McpServerDto {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  hasHeaders: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /api/mcp/servers. `headers` is optional on create. */
export interface CreateMcpServerBody {
  name: string;
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Body for PUT /api/mcp/servers/:id. All fields optional. HEADERS CONTRACT:
 * if `headers` is omitted, the server PRESERVES existing headers; if `headers`
 * is provided (including `{}`), it REPLACES. To clear, send `{}`.
 */
export interface UpdateMcpServerBody {
  name?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

const BASE = '/mcp/servers';

/**
 * REST client for the per-user MCP server config API. All requests send the
 * Bearer token automatically via ApiClient.extendConfig.
 */
export class McpApiClient {
  /** GET /api/mcp/servers — list the authed user's servers (headers masked). */
  static async listServers(): Promise<McpServerDto[]> {
    return ApiClient.get<McpServerDto[]>(BASE);
  }

  /** POST /api/mcp/servers — create a new server. */
  static async createServer(body: CreateMcpServerBody): Promise<McpServerDto> {
    return ApiClient.post<McpServerDto>(BASE, body);
  }

  /** PUT /api/mcp/servers/:id — update a server (partial). */
  static async updateServer(
    id: string,
    body: UpdateMcpServerBody
  ): Promise<McpServerDto> {
    return ApiClient.put<McpServerDto>(`${BASE}/${id}`, body);
  }

  /** DELETE /api/mcp/servers/:id — delete a server. */
  static async deleteServer(id: string): Promise<void> {
    await ApiClient.delete<void>(`${BASE}/${id}`);
  }
}
