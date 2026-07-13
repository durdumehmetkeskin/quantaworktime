import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import logoFull from "../assets/logo-full.png";

import { claimTablet } from "../services/api";
import { saveConfig, type KioskConfig } from "../services/storage";

export function ProvisionScreen({ onProvisioned }: { onProvisioned: (config: KioskConfig) => void }) {
  const [serverUrl, setServerUrl] = useState("http://");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const normalized = serverUrl.replace(/\/+$/, "");
      const claim = await claimTablet(normalized, code.trim().toUpperCase());
      const config: KioskConfig = {
        serverUrl: normalized,
        tabletId: claim.tabletId,
        tabletName: claim.name,
        location: claim.location,
        tabletSecret: claim.tabletSecret,
      };
      await saveConfig(config);
      onProvisioned(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kurulum başarısız oldu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={logoFull} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Quanta Kiosk Kurulumu</Text>
      <Text style={styles.subtitle}>
        Yönetici panelinden aldığınız tek kullanımlık kurulum kodunu girin.
      </Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="Sunucu adresi (http://sunucu:3000)"
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TextInput
        style={[styles.input, styles.codeInput]}
        value={code}
        onChangeText={setCode}
        placeholder="KURULUM KODU"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.button, (busy || code.length !== 8) && styles.buttonDisabled]}
        disabled={busy || code.length !== 8}
        onPress={submit}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Kurulumu Tamamla</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", padding: 32 },
  // single-color navy logo — tint it light so it reads on the dark background
  logo: { alignSelf: "center", width: 220, height: 125, marginBottom: 16, tintColor: "#e2e8f0" },
  title: { color: "#fff", fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#94a3b8", fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 32 },
  input: {
    backgroundColor: "#1e293b",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  codeInput: { textAlign: "center", letterSpacing: 8, fontSize: 22, fontWeight: "700" },
  error: { color: "#f87171", textAlign: "center", marginBottom: 12 },
  button: {
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
