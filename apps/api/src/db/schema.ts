import {
  pgTable,
  bigserial,
  timestamp,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const measurements = pgTable(
  'measurements',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
    voltage: doublePrecision('voltage'),
    current: doublePrecision('current'),
    power: doublePrecision('power'),
  },
  (t) => [uniqueIndex('measurements_date_idx').on(t.date)],
);

export type MeasurementInsert = typeof measurements.$inferInsert;

