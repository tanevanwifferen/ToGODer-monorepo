import { ApiClient } from "./ApiClient";
import { GlobalConfig, PromptsResponse } from "../model/GlobalConfig";

interface BalanceResponse {
  balance: number;
  globalBalance: number;
}

export class GlobalApiClient {
  static async getGlobalConfig(): Promise<GlobalConfig> {
    return ApiClient.get<GlobalConfig>("/global_config");
  }

  static async getPrompts(): Promise<PromptsResponse> {
    return ApiClient.get<PromptsResponse>("/prompts");
  }

  static async getBalance(): Promise<BalanceResponse> {
    return ApiClient.get<BalanceResponse>("/billing");
  }
}
