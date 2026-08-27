import { ToolRegistry } from './ToolRegistry';
import { getDbContext } from '../Entity/Database';

/**
 * Register the schedule_wakeup tool so the assistant can programmatically
 * schedule a future check-in with a push notification.
 */
export function registerScheduleWakeupTool(): void {
  const registry = ToolRegistry.getInstance();

  registry.register(
    'schedule_wakeup',
    {
      type: 'function',
      function: {
        name: 'schedule_wakeup',
        description:
          'Schedule a future wake-up when ToGODer should proactively check in ' +
          'with the user via push notification. At the scheduled time, the system ' +
          'will evaluate the user\'s recent context and decide whether to send a ' +
          'personalised push message. Use this when the user asks you to check on ' +
          'them later, or when you want to follow up on something time-sensitive.\n\n' +
          'IMPORTANT: This only works if the user has push notifications enabled ' +
          '(registered an Expo Push Token via the mobile app). If they haven\'t, ' +
          'the wakeup will fire but no notification will be delivered.',
        parameters: {
          type: 'object',
          properties: {
            triggerAt: {
              type: 'string',
              description:
                'ISO 8601 timestamp of when to fire the wake-up ' +
                '(e.g. "2026-08-28T14:00:00Z"). Must be in the future.',
            },
            reason: {
              type: 'string',
              description:
                'Why you are scheduling this wake-up. This reason will be ' +
                'shown to the wake-up evaluation model so it can make a ' +
                'contextual decision. Be specific (e.g. "Check if Tane has ' +
                'followed up on his exercise commitment from earlier today").',
            },
          },
          required: ['triggerAt', 'reason'],
        },
      },
    },
    async (ctx) => {
      const triggerAt = ctx.arguments.triggerAt as string;
      const reason = ctx.arguments.reason as string;
      const request = ctx.request;

      if (!triggerAt || typeof triggerAt !== 'string') {
        return 'Error: triggerAt is required and must be an ISO 8601 timestamp string.';
      }
      if (!reason || typeof reason !== 'string') {
        return 'Error: reason is required and must be a string describing why you are scheduling this.';
      }

      const parsedDate = new Date(triggerAt);
      if (isNaN(parsedDate.getTime())) {
        return `Error: "${triggerAt}" is not a valid ISO 8601 date. Example: "2026-08-28T14:00:00Z"`;
      }

      const now = new Date();
      if (parsedDate <= now) {
        return `Error: triggerAt (${triggerAt}) must be in the future. Current time: ${now.toISOString()}`;
      }

      // Queue the wakeup for persistence (the streaming service picks it up)
      if (!request._pendingWakeup) {
        request._pendingWakeup = [];
      }
      request._pendingWakeup.push({ triggerAt: parsedDate, reason });

      const friendly = parsedDate.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      return (
        `✅ Wake-up scheduled for ${friendly}.\n` +
        `Reason: "${reason}"\n\n` +
        `I'll check in with you then and decide whether to send a push notification ` +
        `based on your recent context. Make sure you have push notifications enabled!`
      );
    },
    (_request) => true, // always enabled; streaming service checks auth on persist
  );
}

/**
 * Pending wakeup intent queued by the schedule_wakeup tool.
 */
export interface PendingWakeup {
  triggerAt: Date;
  reason: string;
}

/**
 * Drain pending wakeup intents from a request.
 */
export function drainPendingWakeups(request: any): PendingWakeup[] {
  const ops = request._pendingWakeup ?? [];
  request._pendingWakeup = [];
  return ops;
}