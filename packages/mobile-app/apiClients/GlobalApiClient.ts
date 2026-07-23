import { ApiClient } from "./ApiClient";
import { GlobalConfig, PromptsResponse } from "../model/GlobalConfig";

interface BalanceResponse {
  balance: number;
  globalBalance: number;
}

interface ReferralCodeResponse {
  referralCode: string;
  referralLink: string;
  creditsBalance: number;
}

interface CreditTransaction {
  id: string;
  userId: string;
  amount: string;
  type: 'credit' | 'debit';
  source: string;
  description: string | null;
  createdAt: string;
}

interface CreditTransactionsResponse {
  transactions: CreditTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

  static async getReferralCode(): Promise<ReferralCodeResponse> {
    return ApiClient.get<ReferralCodeResponse>("/referral/code");
  }

  static async getCreditTransactions(page: number = 1, limit: number = 20): Promise<CreditTransactionsResponse> {
    return ApiClient.get<CreditTransactionsResponse>(`/credits/transactions?page=${page}&limit=${limit}`);
  }
}
