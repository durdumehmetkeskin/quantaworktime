import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import KeepAwake from "react-native-keep-awake";
import QRCode from "react-native-qrcode-svg";

import { HEARTBEAT_INTERVAL_SECONDS, QR_ROTATION_SECONDS } from "@quanta/shared";

import { fetchRecentCheckins, sendHeartbeat, syncNonces } from "../services/api";
import { requestBlePermissions, startGattServer, stopGattServer, updateBleState } from "../services/ble";
import { QrGenerator } from "../services/qr";
import type { KioskConfig } from "../services/storage";

interface Toast {
  fullName: string;
  type: string;
}

export function MainScreen({ config }: { config: KioskConfig }) {
  const { width, height } = useWindowDimensions();
  // Fill most of the screen: bigger modules scan far more reliably from
  // another device's camera. ecl "L" below also reduces module count.
  const qrSize = Math.min(Math.floor(Math.min(width, height) * 0.72), 640);
  const generator = useMemo(
    () => new QrGenerator(config.tabletId, config.tabletSecret),
    [config.tabletId, config.tabletSecret],
  );
  const [qrToken, setQrToken] = useState("");
  const [countdown, setCountdown] = useState(QR_ROTATION_SECONDS);
  const [online, setOnline] = useState(false);
  const [bleActive, setBleActive] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const lastSeenCheckin = useRef<string | null>(null);

  const rotateQr = useCallback(() => {
    const state = generator.next();
    setQrToken(state.token);
    setCountdown(QR_ROTATION_SECONDS);
    // BLE responses must always use the freshest nonce.
    void updateBleState(config.tabletSecret, state.nonce);
    // Sync the new nonce to the server IMMEDIATELY: a phone that scanned the
    // previous QR may finish its BLE step after this rotation, and the server
    // can only accept the response if it already knows this nonce.
    const pending = generator.takePending();
    syncNonces(config, pending)
      .then(() => {
        generator.markSynced(pending);
        setOnline(true);
      })
      .catch(() => setOnline(false));
  }, [generator, config]);

  // QR rotation — keeps producing even while offline (spec §1).
  useEffect(() => {
    rotateQr();
    const rotate = setInterval(rotateQr, QR_ROTATION_SECONDS * 1000);
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, [rotateQr]);

  // BLE advertising + GATT server, always on in the background.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const granted = await requestBlePermissions();
      if (!granted) return;
      const started = await startGattServer(config.tabletId);
      if (mounted) setBleActive(started);
    })();
    return () => {
      mounted = false;
      void stopGattServer();
    };
  }, [config.tabletId]);

  // Heartbeat + nonce sync every 5 minutes, plus an eager nonce sync every rotation.
  useEffect(() => {
    const sync = async () => {
      try {
        await sendHeartbeat(config);
        const pending = generator.takePending();
        if (pending.length > 0) {
          await syncNonces(config, pending);
          generator.markSynced(pending);
        }
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    void sync();
    // Per-rotation nonce sync happens in rotateQr; this interval is the
    // 5-minute heartbeat plus a catch-up for nonces that failed to sync.
    const heartbeat = setInterval(sync, HEARTBEAT_INTERVAL_SECONDS * 1000);
    return () => clearInterval(heartbeat);
  }, [config, generator]);

  // Recent successful check-ins → short welcome toast.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const recent = await fetchRecentCheckins(config);
        const newest = recent[0];
        if (newest && newest.timestamp !== lastSeenCheckin.current) {
          if (lastSeenCheckin.current !== null) {
            setToast({ fullName: newest.fullName, type: newest.type });
            setTimeout(() => setToast(null), 4000);
          }
          lastSeenCheckin.current = newest.timestamp;
        }
      } catch {
        // offline — ignore
      }
    }, 10_000);
    return () => clearInterval(poll);
  }, [config]);

  return (
    <View style={styles.container}>
      <KeepAwake />
      <View style={styles.header}>
        <View>
          <Text style={styles.tabletName}>{config.tabletName}</Text>
          <Text style={styles.location}>{config.location}</Text>
        </View>
        <View style={styles.statusRow}>
          <StatusDot label={online ? "Çevrimiçi" : "Çevrimdışı"} ok={online} />
          <StatusDot label={bleActive ? "BLE Aktif" : "BLE Kapalı"} ok={bleActive} />
        </View>
      </View>

      <View style={styles.qrWrap}>
        {qrToken !== "" && (
          <QRCode value={qrToken} size={qrSize} backgroundColor="#fff" ecl="L" quietZone={16} />
        )}
        <Text style={styles.countdown}>Yeni kod: {countdown} sn</Text>
      </View>

      <Text style={styles.hint}>Giriş / çıkış için Quanta uygulamasıyla kodu okutun</Text>

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>
            {toast.type === "IN" ? "✅ Hoş geldiniz" : "👋 İyi günler"}, {toast.fullName}
          </Text>
        </View>
      )}
    </View>
  );
}

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.statusItem}>
      <View style={[styles.dot, { backgroundColor: ok ? "#34d399" : "#f87171" }]} />
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    padding: 24,
  },
  tabletName: { color: "#fff", fontSize: 22, fontWeight: "700" },
  location: { color: "#94a3b8", fontSize: 14 },
  statusRow: { flexDirection: "row", gap: 16 },
  statusItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { color: "#cbd5e1", fontSize: 13 },
  qrWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    marginVertical: 8,
  },
  countdown: { marginTop: 16, fontSize: 18, fontWeight: "600", color: "#334155" },
  hint: { color: "#94a3b8", fontSize: 16, marginVertical: 24 },
  toast: {
    position: "absolute",
    bottom: 32,
    backgroundColor: "#065f46",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  toastText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
