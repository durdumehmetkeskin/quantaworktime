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
import { login } from "../lib/api";
import { colors, sharedStyles } from "../theme";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim().toLowerCase(), password);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Giriş başarısız.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.center}>
        <Image source={logoFull} style={styles.logo} resizeMode="contain" />
        <Text style={sharedStyles.title}>Quanta Mesai</Text>
        <Text style={sharedStyles.subtitle}>Çalışan girişi</Text>
        <TextInput
          style={sharedStyles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={sharedStyles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Şifre"
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        {error && <Text style={sharedStyles.error}>{error}</Text>}
        <TouchableOpacity
          style={[sharedStyles.primaryButton, busy && sharedStyles.disabled]}
          disabled={busy || !email || !password}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={sharedStyles.primaryButtonText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center" },
  // single-color navy logo — tint it light so it reads on the dark background
  logo: { alignSelf: "center", width: 200, height: 114, marginBottom: 12, tintColor: "#e2e8f0" },
});
