import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { AttendanceType, type AuthUserInfo } from "@quanta/shared";

import { flushQueue, queueLength } from "../lib/offlineQueue";
import { colors, sharedStyles } from "../theme";

export function HomeScreen({
  user,
  onStartCheck,
  onOpenHistory,
  onLogout,
}: {
  user: AuthUserInfo | null;
  onStartCheck: (type: AttendanceType) => void;
  onOpenHistory: () => void;
  onLogout: () => void;
}) {
  const [queued, setQueued] = useState(0);
  const [flushInfo, setFlushInfo] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const result = await flushQueue();
    setQueued(result.remaining);
    if (result.sent > 0 || result.rejected > 0) {
      setFlushInfo(
        [
          result.sent > 0 ? `${result.sent} bekleyen kayıt gönderildi` : null,
          result.rejected > 0 ? `${result.rejected} kayıt zaman aşımına uğradı, tekrar okutun` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setTimeout(() => setFlushInfo(null), 6000);
    }
  }, []);

  useEffect(() => {
    void queueLength().then(setQueued);
    void refreshQueue();
    const interval = setInterval(refreshQueue, 30_000);
    return () => clearInterval(interval);
  }, [refreshQueue]);

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Merhaba,</Text>
          <Text style={styles.name}>{user?.fullName ?? ""}</Text>
        </View>
        <TouchableOpacity onPress={onLogout}>
          <Text style={{ color: colors.muted }}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      {queued > 0 && (
        <View style={styles.queueBanner}>
          <Text style={styles.queueText}>
            {queued} kayıt gönderim bekliyor (çevrimdışı kuyruğu)
          </Text>
        </View>
      )}
      {flushInfo && (
        <View style={[styles.queueBanner, { backgroundColor: "#064e3b" }]}>
          <Text style={styles.queueText}>{flushInfo}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.bigButton, { backgroundColor: colors.success }]}
          onPress={() => onStartCheck(AttendanceType.IN)}
        >
          <Text style={styles.bigButtonIcon}>→</Text>
          <Text style={styles.bigButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bigButton, { backgroundColor: colors.danger }]}
          onPress={() => onStartCheck(AttendanceType.OUT)}
        >
          <Text style={styles.bigButtonIcon}>←</Text>
          <Text style={styles.bigButtonText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.historyLink} onPress={onOpenHistory}>
        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>
          Geçmişim →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  greeting: { color: colors.muted, fontSize: 15 },
  name: { color: colors.text, fontSize: 22, fontWeight: "700" },
  queueBanner: {
    backgroundColor: "#78350f",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  queueText: { color: "#fef3c7", fontSize: 13, textAlign: "center" },
  buttons: { flex: 1, justifyContent: "center", gap: 20 },
  bigButton: {
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: "center",
  },
  bigButtonIcon: { fontSize: 36, color: "#fff" },
  bigButtonText: { color: "#fff", fontSize: 24, fontWeight: "700", marginTop: 4 },
  historyLink: { alignItems: "center", paddingVertical: 16 },
});
