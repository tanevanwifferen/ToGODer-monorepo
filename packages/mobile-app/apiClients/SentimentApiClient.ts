import { ApiClient } from "./ApiClient";
import { ApiChatMessage } from "../model/ChatRequest";
import { SentimentSummary } from "../model/Sentiment";

interface SentimentResponse {
  sentiment: SentimentSummary | null;
}

/**
 * Client for the dedicated sentiment endpoint. Requires authentication and a
 * positive balance (the analysis is billed); the server replies 401/402
 * otherwise. Repeat analyses of the same messages are server-side replays
 * and are not billed again.
 */
export class SentimentApiClient {
  static async analyze(
    messages: ApiChatMessage[]
  ): Promise<SentimentSummary | null> {
    const response = await ApiClient.post<SentimentResponse>("/sentiment", {
      prompts: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (response instanceof Error) {
      throw response;
    }
    return (response as SentimentResponse).sentiment ?? null;
  }
}
