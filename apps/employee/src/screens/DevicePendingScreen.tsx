import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Platform } from "react-native";

import { fetchMyDevice, registerDevice, type DeviceStatusInfo } from "../lib/deviceKey";
import { colors, sharedStyles } from "../theme";

/**
 * First-login device binding: generates the device key, registers it
 * (PENDING_APPROVAL) and waits for admin approval, polling every 10s.
 */
export function DevicePendingScreen({
  device,
  onApproved,
  onLogout,
}: {
  device: DeviceStatusInfo | null;
  onApproved: () => void;
  onLogout: () => void;
}) {
  const [current, setCurrent] = useState<DeviceStatusInfo | null>(device);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      await registerDevice(`${Platform.OS} ${Platform.Version}`);
      setCurrent(await fetchMyDevice());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cihaz kaydı başarısız.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (current?.status !== "PENDING_APPROVAL") return;
    const poll = setInterval(async () => {
      try {
        const fresh = await fetchMyDevice();
        setCurrent(fresh);
        if (fresh?.status === "ACTIVE") onApproved();
      } catch {
        // offline — keep polling
      }
    }, 10_000);
    return () => clearInterval(poll);
  }, [current?.status, onApproved]);

  return (
    <View style={[sharedStyles.screen, { justifyContent: "center" }]}>
      <Text style={sharedStyles.title}>Cihaz Kaydı</Text>
      {current === null && (
        <>
          <Text style={sharedStyles.subtitle}>
            Mesai kaydı için bu telefonu hesabınıza bağlamanız gerekiyor. Kayıt sonrası yönetici
            onayı beklenir.
          </Text>
          {error && <Text style={sharedStyles.error}>{error}</Text>}
          <TouchableOpacity
            style={[sharedStyles.primaryButton, busy && sharedStyles.disabled]}
            disabled={busy}
            onPress={register}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={sharedStyles.primaryButtonText}>Bu Cihazı Kaydet</Text>
            )}
          </TouchableOpacity>
        </>
      )}
      {current?.status === "PENDING_APPROVAL" && (
        <>
          <ActivityIndicator color={colors.warning} size="large" style={{ marginVertical: 24 }} />
          <Text style={[sharedStyles.subtitle, { color: colors.warning }]}>
            Cihazınız yönetici onayı bekliyor. Onaylandığında bu ekran otomatik kapanacak.
          </Text>
        </>
      )}
      {current?.status === "REVOKED" && (
        <>
          <Text style={[sharedStyles.subtitle, { color: colors.danger }]}>
            Bu cihazın erişimi kaldırılmış. Yeniden kayıt talebi gönderebilirsiniz; yöneticiniz
            onaylamadan giriş yapılamaz.
          </Text>
          <TouchableOpacity style={sharedStyles.primaryButton} onPress={register}>
            <Text style={sharedStyles.primaryButtonText}>Yeniden Kaydet</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity onPress={onLogout} style={{ marginTop: 24 }}>
        <Text style={{ color: colors.muted, textAlign: "center" }}>Çıkış yap</Text>
      </TouchableOpacity>
    </View>
  );
}
