import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { AttendanceType, CheckResponse } from "@quanta/shared";

import type { TabletBleClient } from "../ble/TabletBleClient";
import { performCheck, type CheckProgress } from "../lib/attendance";
import { colors, sharedStyles } from "../theme";

const STEP_LABELS: Record<CheckProgress, string> = {
  challenge: "Sunucudan doğrulama isteniyor…",
  ble: "Tablet doğrulanıyor… (Bluetooth)",
  submit: "Kayıt gönderiliyor…",
};

type Phase =
  | { kind: "working"; step: CheckProgress }
  | { kind: "success"; response: CheckResponse }
  | { kind: "queued" }
  | { kind: "error"; message: string };

/** Progress + result screen for one check attempt (spec Faz 6 ana akış). */
export function CheckScreen({
  qrToken,
  type,
  ble,
  onDone,
}: {
  qrToken: string;
  type: AttendanceType;
  ble: TabletBleClient;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "working", step: "challenge" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const result = await performCheck(qrToken, type, ble, (step) =>
          setPhase({ kind: "working", step }),
        );
        setPhase(
          result.outcome === "success"
            ? { kind: "success", response: result.response! }
            : { kind: "queued" },
        );
      } catch (error) {
        setPhase({
          kind: "error",
          message: error instanceof Error ? error.message : "Doğrulama başarısız.",
        });
      }
    })();
  }, [qrToken, type, ble]);

  return (
    <View style={[sharedStyles.screen, styles.center]}>
      {phase.kind === "working" && (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stepText}>{STEP_LABELS[phase.step]}</Text>
        </>
      )}
      {phase.kind === "success" && (
        <>
          <Text style={styles.resultIcon}>✅</Text>
          <Text style={styles.resultTitle}>{phase.response.message}</Text>
          {phase.response.lateMinutes > 0 && (
            <Text style={[styles.resultDetail, { color: colors.warning }]}>
              {phase.response.lateMinutes} dakika geç kaldınız.
            </Text>
          )}
        </>
      )}
      {phase.kind === "queued" && (
        <>
          <Text style={styles.resultIcon}>📶</Text>
          <Text style={styles.resultTitle}>Kayıt kuyruğa alındı</Text>
          <Text style={styles.resultDetail}>
            Bağlantı gelince otomatik gönderilecek. Uzun süre bağlantı olmazsa tablete tekrar
            okutmanız gerekir.
          </Text>
        </>
      )}
      {phase.kind === "error" && (
        <>
          <Text style={styles.resultIcon}>⛔</Text>
          <Text style={styles.resultTitle}>İşlem başarısız</Text>
          <Text style={styles.resultDetail}>{phase.message}</Text>
        </>
      )}
      {phase.kind !== "working" && (
        <TouchableOpacity style={[sharedStyles.primaryButton, styles.doneButton]} onPress={onDone}>
          <Text style={sharedStyles.primaryButtonText}>Tamam</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  stepText: { color: colors.text, fontSize: 17, marginTop: 20 },
  resultIcon: { fontSize: 56 },
  resultTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center" },
  resultDetail: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" },
  doneButton: { alignSelf: "stretch", marginTop: 32 },
});
