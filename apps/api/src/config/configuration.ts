export interface AppConfig {
  port: number;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  encryptionKeyHex: string;
}

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const required = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"];
  for (const key of required) {
    if (!env[key] || String(env[key]).trim() === "") {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  if (!/^[0-9a-fA-F]{64}$/.test(String(env.ENCRYPTION_KEY))) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return env;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? "3000", 10),
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    username: process.env.DB_USER ?? "quanta",
    password: process.env.DB_PASSWORD ?? "quanta_dev_password",
    name: process.env.DB_NAME ?? "quanta_worktime",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessTtl: process.env.JWT_ACCESS_TTL ?? "900s",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
  },
  encryptionKeyHex: process.env.ENCRYPTION_KEY!,
});
