import { useEffect } from "react";
import { useSelector } from "react-redux";
import { MessageService } from "../services/MessageService";
import { selectSentimentForChat } from "../redux/slices/sentimentSlice";
import { useAuth } from "./useAuth";
import { selectBalance } from "../redux/slices/balanceSlice";
import { selectSentimentEnabled } from "../redux/slices/globalConfigSlice";

/**
 * Automatically fetch the emotion analysis when a chat is opened and none is
 * in the store yet. MessageService.autoFetchSentiment re-checks eligibility
 * (feature enabled, logged in, positive balance) and is idempotent — already
 * analysed messages replay for free server-side.
 */
export function useAutoSentiment(chatId: string): void {
  const summary = useSelector(selectSentimentForChat(chatId));
  const { isAuthenticated } = useAuth();
  const balance = useSelector(selectBalance);
  const featureEnabled = useSelector(selectSentimentEnabled);

  const eligible = featureEnabled && isAuthenticated && balance.balance > 0;

  useEffect(() => {
    if (chatId && eligible && !summary) {
      MessageService.getInstance().autoFetchSentiment(chatId);
    }
  }, [chatId, eligible, summary]);
}
