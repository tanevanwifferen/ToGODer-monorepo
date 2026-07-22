import { ApiClient } from "./ApiClient";

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
  cohortRetention: { cohortWeek: string; w1: number; w2: number; w4: number }[];
}

export const AdminApiClient = {
  getMetrics(): Promise<MetricsSnapshot> {
    return ApiClient.get<MetricsSnapshot>("/admin/metrics");
  },
};
