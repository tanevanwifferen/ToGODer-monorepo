import { ApiClient } from './ApiClient';
import { MemoryCompressiontRequest, MemoryCompressiontResponse, MemoryTagResponse } from '../model/MemoryRequest';

export class MemoryApiClient {
  static async fetchMemoryKeys(
    shortTermMemory: string,
    existingKeys: string[]
  ): Promise<MemoryTagResponse> {
    const response = await ApiClient.post<MemoryTagResponse>('/memory/fetch-keys', {
      shortTermMemory,
      existingKeys
    });

    return response;
  }

  static async compressMemory(
    shortTermMemory: string,
    longTermMemory: Record<string, string>
  ): Promise<MemoryCompressiontResponse> {
    const request: MemoryCompressiontRequest = {
      shortTermMemory,
      longTermMemory
    };

    const response = await ApiClient.post<MemoryCompressiontResponse>('/memory/compress', request);

    return response;
  }
}
