import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import {
  McpApiClient,
  type McpServerDto,
  type CreateMcpServerBody,
  type UpdateMcpServerBody,
} from '../../apiClients/McpApiClient';
import type { RootState } from '../store';

export interface McpState {
  servers: McpServerDto[];
  loading: boolean;
  error: string | null;
}

const initialState: McpState = {
  servers: [],
  loading: false,
  error: null,
};

/**
 * Extract a human-readable message from a rejected API response. The ApiClient
 * interceptor rejects with an object that may carry `.error` (string) or be a
 * shaped validation error `{ error, details }`. Throw an Error so RTK's default
 * error serializer captures a useful `message` in the rejected action.
 */
function apiError(e: unknown): Error {
  if (e && typeof e === 'object' && 'error' in e) {
    const msg = (e as { error: unknown }).error;
    if (typeof msg === 'string') return new Error(msg);
  }
  if (e instanceof Error) return e;
  return new Error('Request failed');
}

/** Fetch the authed user's MCP servers. */
export const fetchMcpServers = createAsyncThunk<McpServerDto[]>(
  'mcp/fetchServers',
  async () => {
    try {
      return await McpApiClient.listServers();
    } catch (e) {
      throw apiError(e);
    }
  }
);

/** Create a new MCP server. */
export const createMcpServer = createAsyncThunk<
  McpServerDto,
  CreateMcpServerBody
>('mcp/createServer', async (body) => {
  try {
    return await McpApiClient.createServer(body);
  } catch (e) {
    throw apiError(e);
  }
});

/** Update an MCP server. */
export const updateMcpServer = createAsyncThunk<
  McpServerDto,
  { id: string; body: UpdateMcpServerBody }
>('mcp/updateServer', async ({ id, body }) => {
  try {
    return await McpApiClient.updateServer(id, body);
  } catch (e) {
    throw apiError(e);
  }
});

/** Delete an MCP server. */
export const deleteMcpServer = createAsyncThunk<string, string>(
  'mcp/deleteServer',
  async (id) => {
    try {
      await McpApiClient.deleteServer(id);
      return id;
    } catch (e) {
      throw apiError(e);
    }
  }
);

const mcpSlice = createSlice({
  name: 'mcp',
  initialState,
  reducers: {
    clearMcpError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetch
      .addCase(fetchMcpServers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchMcpServers.fulfilled,
        (state, action: PayloadAction<McpServerDto[]>) => {
          state.servers = action.payload;
          state.loading = false;
        }
      )
      .addCase(fetchMcpServers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load MCP servers';
      })
      // create
      .addCase(createMcpServer.pending, (state) => {
        state.error = null;
      })
      .addCase(createMcpServer.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to create MCP server';
      })
      // update
      .addCase(updateMcpServer.pending, (state) => {
        state.error = null;
      })
      .addCase(updateMcpServer.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to update MCP server';
      })
      // delete
      .addCase(deleteMcpServer.pending, (state) => {
        state.error = null;
      })
      .addCase(deleteMcpServer.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to delete MCP server';
      });
  },
});

export const { clearMcpError } = mcpSlice.actions;

export const selectMcpServers = (state: RootState): McpServerDto[] =>
  state.mcp?.servers ?? [];
export const selectMcpLoading = (state: RootState): boolean =>
  state.mcp?.loading ?? false;
export const selectMcpError = (state: RootState): string | null =>
  state.mcp?.error ?? null;

export default mcpSlice.reducer;
