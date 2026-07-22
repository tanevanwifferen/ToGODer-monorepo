import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";
import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";
import { AdminApiClient, MetricsSnapshot } from "../../apiClients/AdminApiClient";
import { selectIsAdmin } from "../../redux/slices/authSlice";
import { Colors } from "../../constants/Colors";

export default function AdminScreen() {
  const isAdmin = useSelector(selectIsAdmin);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setError(null);
    try {
      const data = await AdminApiClient.getMetrics();
      setMetrics(data);
    } catch (err: any) {
      const status = err?.status;
      if (status === 401 || status === 403) {
        setError("You do not have admin access.");
      } else {
        setError(err?.message || "Failed to load metrics.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      fetchMetrics();
    } else {
      setLoading(false);
      setError("You must be an admin to view this page.");
    }
  }, [isAdmin, fetchMetrics]);

  if (!isAdmin) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Admin Panel</ThemedText>
        <ThemedText style={styles.errorText}>
          You must be an admin to view this page.
        </ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Loading metrics…</ThemedText>
      </ThemedView>
    );
  }

  if (error || !metrics) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">Admin Panel</ThemedText>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  const funnelMax = Math.max(...metrics.funnel.map((f) => f.count), 1);
  const cohort = metrics.cohortRetention.slice(-8); // last 8 cohorts

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchMetrics} />
      }
    >
      {/* ── Header cards: DAU / WAU / MAU ── */}
      <View style={styles.cardRow}>
        <MetricCard label="DAU" value={metrics.dau} isDark={isDark} />
        <MetricCard label="WAU" value={metrics.wau} isDark={isDark} />
        <MetricCard label="MAU" value={metrics.mau} isDark={isDark} />
      </View>

      {/* ── Today stats ── */}
      <View style={styles.cardRow}>
        <MetricCard
          label="New Today"
          value={metrics.todayNewConversations}
          isDark={isDark}
        />
        <MetricCard
          label="Returning Today"
          value={metrics.todayReturningConversations}
          isDark={isDark}
        />
        <MetricCard
          label="Subscribers"
          value={metrics.subscriptionCount}
          isDark={isDark}
        />
      </View>

      {/* ── TTFM ── */}
      {metrics.timeToFirstMessageMedian != null && (
        <View
          style={[
            styles.card,
            isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
          ]}
        >
          <ThemedText
            style={[styles.cardLabel, isDark && { color: "#9BA1A6" }]}
          >
            TIME TO FIRST MESSAGE (MEDIAN)
          </ThemedText>
          <ThemedText style={styles.bigNum}>
            {metrics.timeToFirstMessageMedian}s
          </ThemedText>
        </View>
      )}

      {/* ── Funnel ── */}
      <View
        style={[
          styles.card,
          isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
        ]}
      >
        <ThemedText
          style={[styles.cardLabel, isDark && { color: "#9BA1A6" }]}
        >
          FUNNEL
        </ThemedText>
        {metrics.funnel.map((f) => (
          <View key={f.stage} style={styles.funnelRow}>
            <ThemedText style={styles.funnelLabel} numberOfLines={1}>
              {f.stage}
            </ThemedText>
            <View
              style={[
                styles.funnelBarContainer,
                isDark && { backgroundColor: "#2d2d3f" },
              ]}
            >
              <View
                style={[
                  styles.funnelBar,
                  {
                    width: `${Math.max((f.count / funnelMax) * 100, 2)}%`,
                  },
                ]}
              />
            </View>
            <ThemedText
              style={[styles.funnelCount, isDark && { color: "#9BA1A6" }]}
            >
              {f.count}
            </ThemedText>
          </View>
        ))}
        {metrics.funnel.length === 0 && (
          <ThemedText style={[styles.muted, isDark && { color: "#9BA1A6" }]}>
            No data yet
          </ThemedText>
        )}
      </View>

      {/* ── Top Questions ── */}
      <View
        style={[
          styles.card,
          isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
        ]}
      >
        <ThemedText
          style={[styles.cardLabel, isDark && { color: "#9BA1A6" }]}
        >
          TOP QUESTIONS
        </ThemedText>
        {metrics.topQuestions.length > 0 ? (
          <View style={styles.table}>
            <TableHeader cols={["#", "Question", "Count"]} isDark={isDark} />
            {metrics.topQuestions.map((q, i) => (
              <TableRow
                key={i}
                cols={[
                  String(i + 1),
                  q.question,
                  String(q.count),
                ]}
                isDark={isDark}
              />
            ))}
          </View>
        ) : (
          <ThemedText style={[styles.muted, isDark && { color: "#9BA1A6" }]}>
            No data yet
          </ThemedText>
        )}
      </View>

      {/* ── Daily Active ── */}
      <View
        style={[
          styles.card,
          isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
        ]}
      >
        <ThemedText
          style={[styles.cardLabel, isDark && { color: "#9BA1A6" }]}
        >
          DAILY ACTIVE USERS
        </ThemedText>
        {metrics.dailyActive.length > 0 ? (
          <View style={styles.table}>
            <TableHeader cols={["Date", "Users"]} isDark={isDark} />
            {metrics.dailyActive.map((d) => (
              <TableRow
                key={d.date}
                cols={[d.date, String(d.count)]}
                isDark={isDark}
              />
            ))}
          </View>
        ) : (
          <ThemedText style={[styles.muted, isDark && { color: "#9BA1A6" }]}>
            No data yet
          </ThemedText>
        )}
      </View>

      {/* ── Cohort Retention ── */}
      <View
        style={[
          styles.card,
          isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
        ]}
      >
        <ThemedText
          style={[styles.cardLabel, isDark && { color: "#9BA1A6" }]}
        >
          COHORT RETENTION
        </ThemedText>
        {cohort.length > 0 ? (
          <View style={styles.table}>
            <TableHeader
              cols={["Cohort Week", "W+1", "W+2", "W+4"]}
              isDark={isDark}
            />
            {cohort.map((c) => (
              <TableRow
                key={c.cohortWeek}
                cols={[
                  c.cohortWeek,
                  `${c.w1}%`,
                  `${c.w2}%`,
                  `${c.w4}%`,
                ]}
                isDark={isDark}
              />
            ))}
          </View>
        ) : (
          <ThemedText style={[styles.muted, isDark && { color: "#9BA1A6" }]}>
            No data yet
          </ThemedText>
        )}
      </View>
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function MetricCard({ label, value, isDark }: { label: string; value: number; isDark: boolean }) {
  return (
    <View
      style={[
        styles.metricCard,
        isDark && { backgroundColor: "#1e2030", shadowOpacity: 0.15 },
      ]}
    >
      <ThemedText style={[styles.metricLabel, isDark && { color: "#9BA1A6" }]}>
        {label}
      </ThemedText>
      <ThemedText style={styles.bigNum}>{value}</ThemedText>
    </View>
  );
}

function TableHeader({
  cols,
  isDark,
}: {
  cols: string[];
  isDark: boolean;
}) {
  return (
    <View style={styles.tableRow}>
      {cols.map((c, i) => (
        <ThemedText
          key={i}
          style={[
            styles.tableHeaderCell,
            isDark && { color: "#9BA1A6" },
            { flex: i === 1 && cols.length > 2 ? 2 : 1 },
          ]}
          numberOfLines={1}
        >
          {c}
        </ThemedText>
      ))}
    </View>
  );
}

function TableRow({
  cols,
  isDark,
}: {
  cols: string[];
  isDark: boolean;
}) {
  return (
    <View style={[styles.tableRow, styles.tableRowBorder, isDark && { borderTopColor: "#2d2d3f" }]}>
      {cols.map((c, i) => (
        <ThemedText
          key={i}
          style={[
            styles.tableCell,
            { flex: i === 1 && cols.length > 2 ? 2 : 1 },
          ]}
          numberOfLines={i === 1 && cols.length > 2 ? 2 : 1}
        >
          {c}
        </ThemedText>
      ))}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: { marginTop: 8, color: "#dc2626" },
  muted: { color: "#6c757d", fontSize: 14, marginTop: 8 },

  // Cards
  cardRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: "#6c757d",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bigNum: { fontSize: 28, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    color: "#6c757d",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    fontWeight: "600",
  },

  // Funnel
  funnelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  funnelLabel: { width: 90, fontSize: 13 },
  funnelBarContainer: {
    flex: 1,
    height: 18,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
  },
  funnelBar: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
    minWidth: 4,
  },
  funnelCount: { width: 48, fontSize: 13, textAlign: "right", color: "#6c757d" },

  // Tables
  table: { marginTop: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 6 },
  tableRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#eee" },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6c757d",
    textTransform: "uppercase",
    flex: 1,
  },
  tableCell: { fontSize: 13, flex: 1 },
});
