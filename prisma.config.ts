import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

const isMigrationCommand = process.argv.some((argument) => argument.toLowerCase() === "migrate");
dotenv.config({ path: isMigrationCommand ? ".env.migrations" : ".env" });
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (isMigrationCommand && !migrationUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for Prisma migrate commands.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationUrl ?? env("DATABASE_URL") },
});
