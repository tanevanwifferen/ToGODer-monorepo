import { ApiClient } from './ApiClient';
import { SyncPullResponse, SyncPushRequest, SyncPushResponse } from '../services/sync/types';

/**
 * Client for handling sync-related API requests.
 * Provides methods for fetching and pushing encrypted sync data.
 */
export class SyncApiClient {
  /**
   * Fetch the latest sync data from the server
   * Returns null encryptedData if no sync data exists (404)
   */
  static async pull(): Promise<SyncPullResponse | null> {
    try {
      return await ApiClient.get<SyncPullResponse>('/sync');
    } catch (error: any) {
      // 404 means no sync data yet - return null
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Push encrypted sync data to the server
   */
  static async push(encryptedData: string, version?: number): Promise<SyncPushResponse> {
    const request: SyncPushRequest = { encryptedData, version };
    return ApiClient.post<SyncPushResponse>('/sync', request);
  }
}
