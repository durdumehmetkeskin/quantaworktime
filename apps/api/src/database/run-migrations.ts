/**
 * Container startup helper: applies pending migrations then exits.
 * Used by the API Docker image before booting the app (see Dockerfile CMD).
 */
import { AppDataSource } from "./data-source";

async function main(): Promise<void> {
  const ds = await AppDataSource.initialize();
  const applied = await ds.runMigrations();
  if (applied.length > 0) {
    console.log(`Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(", ")}`);
  } else {
    console.log("Database schema is up to date.");
  }
  await ds.destroy();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
