import {
  pgTable,
  bigserial,
  timestamp,
  doublePrecision,
} from 'drizzle-orm/pg-core';

export const measurements = pgTable('measurements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  voltage: doublePrecision('voltage'),
  current: doublePrecision('current'),
  power: doublePrecision('power'),
});

export type MeasurementInsert = typeof measurements.$inferInsert;

