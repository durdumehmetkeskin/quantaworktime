import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";

import { colors, sharedStyles } from "../theme";

/** Fullscreen QR scanner (react-native-vision-camera code scanner). */
export function ScanScreen({
  title,
  onScanned,
  onCancel,
}: {
  title: string;
  onScanned: (qrToken: string) => void;
  onCancel: () => void;
}) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const scannedOnce = useRef(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission().then((granted) => setDenied(!granted));
    }
  }, [hasPermission, requestPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      const value = codes[0]?.value;
      if (value && !scannedOnce.current) {
        scannedOnce.current = true;
        onScanned(value);
      }
    },
  });

  if (!hasPermission || denied || !device) {
    return (
      <View style={[sharedStyles.screen, { justifyContent: "center" }]}>
        <Text style={sharedStyles.subtitle}>
          {denied
            ? "Kamera izni verilmedi. Ayarlardan kamera iznini açın."
            : !device
              ? "Kamera bulunamadı."
              : "Kamera izni isteniyor…"}
        </Text>
        <TouchableOpacity style={sharedStyles.primaryButton} onPress={onCancel}>
          <Text style={sharedStyles.primaryButtonText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive codeScanner={codeScanner} />
      <View style={styles.overlay}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.frame} />
        <Text style={styles.hint}>Tabletteki QR kodu çerçeveye hizalayın</Text>
        <TouchableOpacity style={styles.cancel} onPress={onCancel}>
          <Text style={{ color: "#fff", fontWeight: "600" }}>Vazgeç</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", position: "absolute", top: 64 },
  frame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  hint: { color: "#e2e8f0", marginTop: 24, fontSize: 15 },
  cancel: {
    position: "absolute",
    bottom: 48,
    backgroundColor: "rgba(15,23,42,0.8)",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
});
