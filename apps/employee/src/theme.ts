import { StyleSheet } from "react-native";

export const colors = {
  bg: "#0f172a",
  card: "#1e293b",
  text: "#f8fafc",
  muted: "#64748b",
  primary: "#4f46e5",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
};

export const sharedStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", textAlign: "center" },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  error: { color: "#f87171", textAlign: "center", marginBottom: 12 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
