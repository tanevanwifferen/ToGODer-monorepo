import cron from 'node-cron';
import { getDbContext } from '../Entity/Database';
import { PushNotificationService } from './PushNotificationService';
import { ConversationApi } from '../Api/ConversationApi';
import { AIProvider, getDefaultModel } from '../LLM/Model/AIProvider';
import { ChatRequest, ChatRequestCommunicationStyle } from '../Model/ChatRequest';

const WAKEUP_DECISION_PROMPT = `You are ToGODer, a proactive AI assistant. You previously scheduled a wake-up for this user.

CONTEXT:
- Reason you scheduled this: {reason}
- The current time is: {now}
- The user's recent memory keys and values are listed below.

MEMORIES:
{memories}

DECISION:
Based on these memories and the reason you scheduled this:
1. Should you send the user a push notification right now? (yes/no)
2. If yes, what short message should it say? (max 120 chars, warm and personal, signed with the lantern emoji 🏮)

Consider:
- Has enough time passed since your last interaction?
- Is there something meaningful to check in about based on their memories?
- Would a notification right now be helpful or intrusive?

Respond with ONLY a JSON object:
{ "shouldPing": true/false, "message": "your push notification text here" }

If you decide NOT to ping, set shouldPing to false and message to an empty string.`;

/**
 * Service that runs a cron job to check for due scheduled wake-ups,
 * evaluates whether to send a push notification using the LLM,
 * and dispatches push notifications via Expo.
 */
export class WakeupService {
  private pushService: PushNotificationService;
  private conversationApi: ConversationApi;
  private cronTask: any = null;

  constructor() {
    this.pushService = new PushNotificationService();
    this.conversationApi = new ConversationApi('ToGODer');
  }

  /**
   * Start the wakeup poller. Checks every 30 seconds for due wakeups.
   */
  start(): void {
    if (this.cronTask) return;

    this.cronTask = cron.schedule('*/30 * * * * *', async () => {
      await this.tick();
    });

    console.log('[wakeup] Cron poller started (every 30s)');
  }

  /**
   * Stop the wakeup poller.
   */
  stop(): void {
    this.cronTask?.stop();
    this.cronTask = null;
    console.log('[wakeup] Cron poller stopped');
  }

  /**
   * One tick: find all due, unfired, uncancelled wakeups and process them.
   */
  private async tick(): Promise<void> {
    const db = getDbContext();
    const now = new Date();

    try {
      const due = await db.scheduledWakeup.findMany({
        where: {
          fired: false,
          cancelled: false,
          triggerAt: { lte: now },
        },
        include: { user: { include: { pushTokens: true } } },
      });

      if (due.length === 0) return;

      console.log(`[wakeup] Processing ${due.length} due wakeup(s)`);

      for (const wakeup of due) {
        await this.processWakeup(wakeup);
      }
    } catch (err) {
      console.error('[wakeup] Tick error:', err);
    }
  }

  /**
   * Process a single due wakeup:
   * 1. Fetch the user's memories from the client-side memory store
   * 2. Call the LLM to decide whether to ping
   * 3. If yes, send push notification
   * 4. Mark the wakeup as fired
   */
  private async processWakeup(wakeup: any): Promise<void> {
    const db = getDbContext();
    const userId = wakeup.userId;

    // Check user has push tokens
    const tokens = await db.pushToken.findMany({ where: { userId } });
    if (tokens.length === 0) {
      console.log(`[wakeup] No push tokens for user ${userId}, skipping`);
      await db.scheduledWakeup.update({
        where: { id: wakeup.id },
        data: {
          fired: true,
          firedAt: new Date(),
          resultJson: JSON.stringify({
            shouldPing: false,
            message: '',
            reasoning: 'No push tokens registered for user.',
          }),
        },
      });
      return;
    }

    // Gather memory context from the server-side memory store.
    // Unlike the encrypted client-side blob, ServerMemory is plaintext
    // and written by the write_memory tool on every memory mutation.
    let memoryContext = '(no memories available)';
    try {
      const memories = await db.serverMemory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      if (memories.length > 0) {
        memoryContext = memories
          .map((m) => `${m.key}: ${m.value}`)
          .join('\n');
      }
    } catch (err) {
      console.error('[wakeup] Error reading server memories:', err);
    }

    // Call LLM to decide
    const prompt = WAKEUP_DECISION_PROMPT
      .replace('{reason}', wakeup.reason)
      .replace('{now}', new Date().toISOString())
      .replace('{memories}', memoryContext);

    let shouldPing = false;
    let message = '';
    let reasoning = '';

    try {
      const result = await this.conversationApi.getResponse(
        {
          model: getDefaultModel(),
          humanPrompt: false,
          keepGoing: false,
          outsideBox: false,
          holisticTherapist: false,
          communicationStyle: ChatRequestCommunicationStyle.Default,
          prompts: [{ role: 'user', content: prompt }],
          memories: {},
          memoryIndex: [],
          assistant_name: 'ToGODer',
        },
        null, // no user billing context for wakeup evaluation
      );

      // Parse JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        shouldPing = parsed.shouldPing === true;
        message = parsed.message || '';
        reasoning = `LLM decided: shouldPing=${shouldPing}, message="${message}"`;
      } else {
        reasoning = 'LLM response did not contain valid JSON; defaulting to no ping.';
      }
    } catch (err: any) {
      console.error(`[wakeup] LLM decision error for wakeup ${wakeup.id}:`, err?.message);
      reasoning = `LLM error: ${err?.message}. Defaulting to ping (fail-safe).`;
      shouldPing = true;
      message = `🏮 Checking in on you, as you asked me to earlier.`;
    }

    // Send push if decided
    if (shouldPing && message) {
      await this.pushService.sendToUser(
        userId,
        'ToGODer',
        message,
        { type: 'wakeup', wakeupId: wakeup.id },
      );
    }

    // Mark as fired
    await db.scheduledWakeup.update({
      where: { id: wakeup.id },
      data: {
        fired: true,
        firedAt: new Date(),
        resultJson: JSON.stringify({
          shouldPing,
          message: shouldPing ? message : '',
          reasoning,
        }),
      },
    });

    console.log(
      `[wakeup] Processed ${wakeup.id}: shouldPing=${shouldPing} ` +
        `message="${message.slice(0, 60)}"`,
    );
  }
}

let wakeupServiceInstance: WakeupService | null = null;

export function getWakeupService(): WakeupService {
  if (!wakeupServiceInstance) {
    wakeupServiceInstance = new WakeupService();
  }
  return wakeupServiceInstance;
}