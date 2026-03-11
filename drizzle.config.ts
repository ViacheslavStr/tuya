import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: 'apps/api/.env' });

export default defineConfig({
  schema: './apps/api/src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://tuya:tuya@localhost:5432/tuya',
  },
});
