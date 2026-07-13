import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";

import { parseQrToken, type AttendanceType, type AuthUserInfo } from "@quanta/shared";

import {
  BlePlxTabletClient,
  MockTabletBleClient,
  type TabletBleClient,
} from "./src/ble/TabletBleClient";
import { MOCK_TABLET_SECRET, USE_MOCK_BLE } from "./src/config";
import { clearSession, getStoredUser, hasSession } from "./src/lib/api";
import { fetchMyDevice, hasStoredDeviceKey, type DeviceStatusInfo } from "./src/lib/deviceKey";
import { CheckScreen } from "./src/screens/CheckScreen";
import { DevicePendingScreen } from "./src/screens/DevicePendingScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScanScreen } from "./src/screens/ScanScreen";

type Route =
  | { name: "loading" }
  | { name: "login" }
  | { name: "device"; device: DeviceStatusInfo | null }
  | { name: "home" }
  | { name: "scan"; type: AttendanceType }
  | { name: "check"; type: AttendanceType; qrToken: string }
  | { name: "history" };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: "loading" });
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  // The mock BLE client needs the nonce of the last scanned QR (the same
  // nonce a real tablet would use for its response).
  const lastScannedNonce = useRef<string>("");

  const ble: TabletBleClient = useMemo(
    () =>
      USE_MOCK_BLE
        ? new MockTabletBleClient(MOCK_TABLET_SECRET, () => lastScannedNonce.current)
        : new BlePlxTabletClient(),
    [],
  );

  const resolveEntryRoute = useCallback(async () => {
    if (!(await hasSession())) {
      setRoute({ name: "login" });
      return;
    }
    setUser(await getStoredUser());
    try {
      const device = await fetchMyDevice();
      if (device?.status === "ACTIVE" && !(await hasStoredDeviceKey())) {
        // Reinstall wiped the keystore: the server-approved key no longer
        // exists locally, so every check would fail signature verification.
        // Force a fresh registration instead.
        setRoute({ name: "device", device: null });
      } else {
        setRoute(device?.status === "ACTIVE" ? { name: "home" } : { name: "device", device });
      }
    } catch {
      // token invalid or offline — fall back to login
      setRoute({ name: "login" });
    }
  }, []);

  useEffect(() => {
    void resolveEntryRoute();
  }, [resolveEntryRoute]);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
    setRoute({ name: "login" });
  }, []);

  if (route.name === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      {route.name === "login" && <LoginScreen onLoggedIn={resolveEntryRoute} />}
      {route.name === "device" && (
        <DevicePendingScreen
          device={route.device}
          onApproved={() => setRoute({ name: "home" })}
          onLogout={logout}
        />
      )}
      {route.name === "home" && (
        <HomeScreen
          user={user}
          onStartCheck={(type) => setRoute({ name: "scan", type })}
          onOpenHistory={() => setRoute({ name: "history" })}
          onLogout={logout}
        />
      )}
      {route.name === "scan" && (
        <ScanScreen
          title={route.type === "IN" ? "Giriş — QR Okut" : "Çıkış — QR Okut"}
          onScanned={(qrToken) => {
            try {
              lastScannedNonce.current = parseQrToken(qrToken).n;
            } catch {
              lastScannedNonce.current = "";
            }
            setRoute({ name: "check", type: route.type, qrToken });
          }}
          onCancel={() => setRoute({ name: "home" })}
        />
      )}
      {route.name === "check" && (
        <CheckScreen
          qrToken={route.qrToken}
          type={route.type}
          ble={ble}
          onDone={() => setRoute({ name: "home" })}
        />
      )}
      {route.name === "history" && <HistoryScreen onBack={() => setRoute({ name: "home" })} />}
    </>
  );
}
