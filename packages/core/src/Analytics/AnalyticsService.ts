import { getDbContext } from '../Entity/Database';
import { Event } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────────────
export type AnalyticsEventType =
  | 'conversation_started'
  | 'message_sent'
  | 'chat_message_received'
  | 'conversation_returned'
  | 'newsletter_subscribed'
  | 'account_created'
  | 'login'
  | 'quiz_completed'
  | 'funnel_quiz_to_chat'
  | 'supporter_signup'
  | 'donation_made'
  | 'referral_link_clicked'
  | 'referral_signup'
  | 'referral_conversion';

export interface TrackOptions {
  userId?: string | null;
  source?: string | null;
  props?: Record<string, unknown>;
}

export interface MetricsSnapshot {
  dau: number;
  wau: number;
  mau: number;
  todayNewConversations: number;
  todayReturningConversations: number;
  topQuestions: { question: string; count: number }[];
  subscriptionCount: number;
  funnel: { stage: string; count: number }[];
  dailyActive: { date: string; count: number }[];
  weeklyActive: { week: string; count: number }[];
  monthlyActive: { month: string; count: number }[];
  timeToFirstMessageMedian: number | null;
  cohortRetention: {
    cohortWeek: string;
    w1: number;
    w2: number;
    w4: number;
  }[];
}

// ── Service ────────────────────────────────────────────────────────
export class AnalyticsService {
  /**
   * Fire an analytics event. Non-blocking — errors are logged but never thrown
   * to callers, so analytics can't break the main app.
   */
  trackEvent(type: AnalyticsEventType, opts: TrackOptions = {}): void {
    const db = getDbContext();
    db.event
      .create({
        data: {
          eventType: type,
          userId: opts.userId ?? null,
          source: opts.source ?? null,
          propsJson: opts.props ? JSON.stringify(opts.props) : null,
        },
      })
      .catch((err) => {
        // Analytics must never disrupt the application
        console.error('[analytics] failed to track event:', type, err);
      });
  }

  // ── Metric helpers ─────────────────────────────────────────────

  private db() {
    return getDbContext();
  }

  /** Unique users with any event on the given date (UTC). */
  private async uniqueUsersSince(since: Date): Promise<number> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT COUNT(DISTINCT userId) as cnt FROM Event WHERE timestamp >= ? AND userId IS NOT NULL`,
      since.toISOString(),
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async dau(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    return this.uniqueUsersSince(since);
  }

  async wau(): Promise<number> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.uniqueUsersSince(since);
  }

  async mau(): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return this.uniqueUsersSince(since);
  }

  /** Count events of a given type since a date. */
  private async countEvents(type: string, since?: Date): Promise<number> {
    const db = this.db();
    if (since) {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT COUNT(*) as cnt FROM Event WHERE eventType = ? AND timestamp >= ?`,
        type,
        since.toISOString(),
      );
      return Number(rows[0]?.cnt ?? 0);
    }
    return db.event.count({ where: { eventType: type } });
  }

  async todayNewConversations(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    return this.countEvents('conversation_started', since);
  }

  async todayReturningConversations(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    return this.countEvents('conversation_returned', since);
  }

  /** Top-5 first messages (question) by frequency. */
  async topQuestions(limit = 5): Promise<{ question: string; count: number }[]> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT propsJson, COUNT(*) as cnt
       FROM Event
       WHERE eventType = 'conversation_started' AND propsJson IS NOT NULL
       GROUP BY propsJson
       ORDER BY cnt DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((r) => {
      let question = '';
      try {
        const props = JSON.parse(r.propsJson);
        question = props.firstMessage ?? props.question ?? '';
      } catch {
        question = r.propsJson;
      }
      return { question: question.slice(0, 200), count: Number(r.cnt) };
    });
  }

  /** Count newsletter subscriptions. */
  async subscriptionCount(): Promise<number> {
    return this.countEvents('newsletter_subscribed');
  }

  /** Funnel: count users at each funnel stage. */
  async funnel(): Promise<{ stage: string; count: number }[]> {
    const stages = [
      { label: 'account_created', event: 'account_created' },
      { label: 'first_chat', event: 'conversation_started' },
      { label: 'second_chat', event: 'conversation_returned' },
      { label: 'newsletter', event: 'newsletter_subscribed' },
      { label: 'supporter', event: 'supporter_signup' },
      { label: 'donation', event: 'donation_made' },
    ];

    const result: { stage: string; count: number }[] = [];
    for (const s of stages) {
      const rows: any[] = await this.db().$queryRawUnsafe(
        `SELECT COUNT(DISTINCT userId) as cnt FROM Event WHERE eventType = ? AND userId IS NOT NULL`,
        s.event,
      );
      result.push({ stage: s.label, count: Number(rows[0]?.cnt ?? 0) });
    }
    return result;
  }

  /** Daily active users over the last 30 days. */
  async dailyActive(days = 30): Promise<{ date: string; count: number }[]> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT DATE(timestamp) as date, COUNT(DISTINCT userId) as cnt
       FROM Event
       WHERE userId IS NOT NULL AND timestamp >= DATE('now', ?)
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
      `-${days} days`,
    );
    return rows.map((r) => ({ date: r.date, count: Number(r.cnt) }));
  }

  /** Weekly active users over the last 12 weeks. */
  async weeklyActive(weeks = 12): Promise<{ week: string; count: number }[]> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT strftime('%Y-W%W', timestamp) as week, COUNT(DISTINCT userId) as cnt
       FROM Event
       WHERE userId IS NOT NULL AND timestamp >= DATE('now', ?)
       GROUP BY week
       ORDER BY week ASC`,
      `-${weeks * 7} days`,
    );
    return rows.map((r) => ({ week: r.week, count: Number(r.cnt) }));
  }

  /** Monthly active users over the last 12 months. */
  async monthlyActive(months = 12): Promise<{ month: string; count: number }[]> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT strftime('%Y-%m', timestamp) as month, COUNT(DISTINCT userId) as cnt
       FROM Event
       WHERE userId IS NOT NULL AND timestamp >= DATE('now', ?)
       GROUP BY month
       ORDER BY month ASC`,
      `-${months * 30} days`,
    );
    return rows.map((r) => ({ month: r.month, count: Number(r.cnt) }));
  }

  /** Cohort retention: % of users from cohort week W returning in W+1, W+2, W+4. */
  async cohortRetention(): Promise<
    { cohortWeek: string; w1: number; w2: number; w4: number }[]
  > {
    // Get all user-week pairs from events
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT DISTINCT userId, strftime('%Y-W%W', timestamp) as week
       FROM Event
       WHERE userId IS NOT NULL
       ORDER BY week ASC`,
    );

    // Build user → set of active weeks
    const userWeeks = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!userWeeks.has(r.userId)) userWeeks.set(r.userId, new Set());
      userWeeks.get(r.userId)!.add(r.week);
    }

    // Get sorted unique weeks
    const allWeeks = [...new Set(rows.map((r) => r.week))].sort();

    // Compute cohort retention for last 12 cohort weeks
    const result: { cohortWeek: string; w1: number; w2: number; w4: number }[] =
      [];
    const start = Math.max(0, allWeeks.length - 16);

    for (let i = start; i < allWeeks.length; i++) {
      const cohort = allWeeks[i];
      const cohortUsers = new Set<string>();
      for (const [uid, weeks] of userWeeks) {
        if (weeks.has(cohort)) cohortUsers.add(uid);
      }
      if (cohortUsers.size === 0) continue;

      const w1 = allWeeks[i + 1];
      const w2 = allWeeks[i + 2];
      const w4 = allWeeks[i + 4];

      const w1Return =
        w1 && countReturning(cohortUsers, userWeeks, w1) / cohortUsers.size;
      const w2Return =
        w2 && countReturning(cohortUsers, userWeeks, w2) / cohortUsers.size;
      const w4Return =
        w4 && countReturning(cohortUsers, userWeeks, w4) / cohortUsers.size;

      result.push({
        cohortWeek: cohort,
        w1: Math.round((w1Return || 0) * 1000) / 10,
        w2: Math.round((w2Return || 0) * 1000) / 10,
        w4: Math.round((w4Return || 0) * 1000) / 10,
      });
    }
    return result;
  }

  /** Median seconds from first event to first message per user. */
  async timeToFirstMessageMedian(): Promise<number | null> {
    const rows: any[] = await this.db().$queryRawUnsafe(
      `SELECT e1.userId,
              MIN(e1.timestamp) as first_event,
              (SELECT MIN(e2.timestamp) FROM Event e2
               WHERE e2.userId = e1.userId
                 AND e2.eventType IN ('message_sent','chat_message_received','conversation_started'))
               as first_message
       FROM Event e1
       WHERE e1.userId IS NOT NULL
       GROUP BY e1.userId
       HAVING first_message IS NOT NULL`,
    );
    if (!rows.length) return null;

    const deltas: number[] = [];
    for (const r of rows) {
      const delta =
        (new Date(Number(r.first_message)).getTime() -
          new Date(Number(r.first_event)).getTime()) /
        1000;
      if (delta >= 0) deltas.push(delta);
    }
    if (!deltas.length) return null;

    deltas.sort((a, b) => a - b);
    const mid = Math.floor(deltas.length / 2);
    if (deltas.length % 2 === 0) {
      return Math.round((deltas[mid - 1] + deltas[mid]) / 2);
    }
    return Math.round(deltas[mid]);
  }

  /** Build the complete metrics snapshot for /admin/metrics. */
  async getMetrics(): Promise<MetricsSnapshot> {
    const [
      dau,
      wau,
      mau,
      todayNew,
      todayReturning,
      topQuestions,
      subscriptionCount,
      funnel,
      dailyActive,
      weeklyActive,
      monthlyActive,
      timeToFirstMessageMedian,
      cohortRetention,
    ] = await Promise.all([
      this.dau(),
      this.wau(),
      this.mau(),
      this.todayNewConversations(),
      this.todayReturningConversations(),
      this.topQuestions(),
      this.subscriptionCount(),
      this.funnel(),
      this.dailyActive(),
      this.weeklyActive(),
      this.monthlyActive(),
      this.timeToFirstMessageMedian(),
      this.cohortRetention(),
    ]);

    return {
      dau,
      wau,
      mau,
      todayNewConversations: todayNew,
      todayReturningConversations: todayReturning,
      topQuestions,
      subscriptionCount,
      funnel,
      dailyActive,
      weeklyActive,
      monthlyActive,
      timeToFirstMessageMedian,
      cohortRetention,
    };
  }
}

function countReturning(
  cohort: Set<string>,
  userWeeks: Map<string, Set<string>>,
  targetWeek: string,
): number {
  let count = 0;
  for (const uid of cohort) {
    if (userWeeks.get(uid)?.has(targetWeek)) count++;
  }
  return count;
}

// Singleton
let instance: AnalyticsService | null = null;
export function getAnalytics(): AnalyticsService {
  if (!instance) instance = new AnalyticsService();
  return instance;
}