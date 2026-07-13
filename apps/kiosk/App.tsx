import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";

import { MainScreen } from "./src/screens/MainScreen";
import { ProvisionScreen } from "./src/screens/ProvisionScreen";
import { loadConfig, type KioskConfig } from "./src/services/storage";

export default function App() {
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadConfig().then((stored) => {
      setConfig(stored);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden />
      {config ? <MainScreen config={config} /> : <ProvisionScreen onProvisioned={setConfig} />}
    </>
  );
}
