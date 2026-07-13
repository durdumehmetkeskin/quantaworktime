import * as path from "node:path";

import * as dotenv from "dotenv";
import { DataSource } from "typeorm";

import { ALL_ENTITIES } from "../entities";

// Load repo-root .env first, then a local override if present.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USER ?? "quanta",
  password: process.env.DB_PASSWORD ?? "quanta_dev_password",
  database: process.env.DB_NAME ?? "quanta_worktime",
  entities: ALL_ENTITIES,
  migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],
  synchronize: false,
  logging: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});
