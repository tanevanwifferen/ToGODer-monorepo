import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { getDbContext } from '../Entity/Database';

/**
 * Sends push notifications to a user's registered devices via Expo Push API.
 * Multi-tenant safe: only sends to the devices registered by the target user.
 */
export class PushNotificationService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo();
  }

  /**
   * Send a push notification to all devices registered for a given user.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<{ sent: number; errors: number }> {
    const db = getDbContext();
    const tokens = await db.pushToken.findMany({
      where: { userId },
    });

    if (tokens.length === 0) {
      console.log(`[push] No registered push tokens for user ${userId}`);
      return { sent: 0, errors: 0 };
    }

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data ?? {},
        priority: 'high',
      }));

    if (messages.length === 0) {
      console.log(`[push] No valid Expo push tokens for user ${userId}`);
      return { sent: 0, errors: 0 };
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (err) {
        console.error('[push] Error sending chunk:', err);
      }
    }

    let sent = 0;
    let errors = 0;
    for (const ticket of tickets) {
      if (ticket.status === 'ok') {
        sent++;
      } else if (ticket.status === 'error') {
        errors++;
        const details = (ticket as any).details;
        console.error(
          `[push] Expo push error: ${ticket.message} (code: ${details?.error})`,
        );
        // Clean up invalid tokens
        if (details?.error === 'DeviceNotRegistered') {
          const invalidToken = messages[tickets.indexOf(ticket)]?.to as string;
          if (invalidToken) {
            await db.pushToken
              .deleteMany({ where: { token: invalidToken } })
              .catch(() => {});
          }
        }
      }
    }

    console.log(`[push] User ${userId}: sent=${sent} errors=${errors}`);
    return { sent, errors };
  }
}