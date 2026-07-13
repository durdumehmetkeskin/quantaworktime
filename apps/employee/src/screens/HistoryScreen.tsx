import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { apiRequest } from "../lib/api";
import { colors, sharedStyles } from "../theme";

interface HistoryItem {
  id: string;
  type: "IN" | "OUT";
  timestamp: string;
  tabletName: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  isManual: boolean;
}

interface MyTimesheet {
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  totalLeaveMinutes: number;
  absentDays: number;
}

function currentMonth(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" })
    .format(new Date())
    .slice(0, 7);
}

function formatIstanbul(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatMinutes(total: number): string {
  return `${Math.floor(total / 60)} sa ${total % 60} dk`;
}

/** Own attendance history + monthly summary (spec Faz 6: Geçmişim). */
export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<MyTimesheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [history, timesheet] = await Promise.all([
          apiRequest<{ items: HistoryItem[] }>("/attendance/me?pageSize=50"),
          apiRequest<MyTimesheet | null>(`/timesheets/me/${currentMonth()}`),
        ]);
        setItems(history.items);
        // no timesheet yet → API sends an empty body that parses to {}
        setSummary(
          timesheet && typeof timesheet.totalWorkedMinutes === "number" ? timesheet : null,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Geçmiş yüklenemedi.");
      }
    })();
  }, []);

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>‹ Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Geçmişim</Text>
        <View style={{ width: 48 }} />
      </View>

      {summary && (
        <View style={styles.summaryCard}>
          <SummaryItem label="Toplam Çalışma" value={formatMinutes(summary.totalWorkedMinutes)} />
          <SummaryItem label="Geç Kalma" value={formatMinutes(summary.totalLateMinutes)} />
          <SummaryItem label="Fazla Mesai" value={formatMinutes(summary.totalOvertimeMinutes)} />
          <SummaryItem label="İzin" value={formatMinutes(summary.totalLeaveMinutes ?? 0)} />
          <SummaryItem label="Devamsızlık" value={`${summary.absentDays} gün`} />
        </View>
      )}
      {error && <Text style={sharedStyles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={[sharedStyles.subtitle, { marginTop: 32 }]}>Henüz kayıt yok.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.badge, { color: item.type === "IN" ? colors.success : colors.danger }]}>
              {item.type === "IN" ? "Giriş" : "Çıkış"}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>{formatIstanbul(item.timestamp)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {item.tabletName ?? "Manuel kayıt"}
                {item.lateMinutes > 0 && ` · ${item.lateMinutes} dk geç`}
                {item.earlyLeaveMinutes > 0 && ` · ${item.earlyLeaveMinutes} dk erken`}
              </Text>
            </View>
            {item.isManual && <Text style={{ color: colors.warning, fontSize: 11 }}>düzeltildi</Text>}
          </View>
        )}
      />
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 16,
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  summaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    justifyContent: "space-between",
    rowGap: 10,
  },
  summaryItem: { alignItems: "center", minWidth: "30%", flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  badge: { fontSize: 14, fontWeight: "700", width: 44 },
});
