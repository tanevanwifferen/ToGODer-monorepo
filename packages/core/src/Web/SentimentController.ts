import { Request, Response, NextFunction, Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { setAuthUser } from './Middleware/auth';
import { ToGODerRequest } from './Model/ToGODerRequest';
import {
  SentimentService,
  sentimentIntegrationEnabled,
} from '../Services/SentimentService';

/**
 * Dedicated sentiment endpoint for the emotions view (web + mobile).
 *
 * POST /api/sentiment  { prompts: ChatCompletionMessageParam[] }
 *   → 200 { sentiment: SentimentSummary | null }
 *
 * The analysis is billed to the user, so it requires a logged-in user with a
 * positive personal balance; clients hide the view in every other case.
 * Analysis jobs are idempotent per (user, message text), so refreshing the
 * view after a chat turn replays cached results instead of paying again.
 */
export function GetSentimentRouter(
  messageLimiter: RateLimitRequestHandler
): Router {
  const router = Router();

  router.post(
    '/api/sentiment',
    messageLimiter,
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!sentimentIntegrationEnabled()) {
          res.status(404).json({ error: 'Sentiment analysis is not enabled' });
          return;
        }

        const user = (req as ToGODerRequest).togoder_auth?.user ?? null;
        if (!user) {
          res
            .status(401)
            .json({ error: 'Authentication required for sentiment analysis' });
          return;
        }

        const sentimentService = new SentimentService();
        if (!(await sentimentService.isEligible(user))) {
          res.status(402).json({
            error: 'A positive balance is required for sentiment analysis',
          });
          return;
        }

        const prompts = req.body?.prompts;
        if (!Array.isArray(prompts) || prompts.length === 0) {
          res
            .status(400)
            .json({ error: 'prompts must be a non-empty array of messages' });
          return;
        }

        const sentiment = await sentimentService.analyzeConversation(
          prompts,
          user,
          { pollBudgetMs: sentimentService.viewPollBudgetMs() }
        );

        res.json({ sentiment });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
