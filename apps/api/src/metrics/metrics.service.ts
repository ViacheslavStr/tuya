import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/db.module';
import { measurements } from '../db/schema';
import { Inject } from '@nestjs/common';
import { DRIZZLE } from '../db/db.module';

type MetricKey = 'power' | 'voltage' | 'current';
type Granularity = 'day' | 'month' | 'year';

@Injectable()
export class MetricsService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  private getMetricColumn(metric: MetricKey) {
    switch (metric) {
      case 'voltage':
        return measurements.voltage;
      case 'current':
        return measurements.current;
      case 'power':
      default:
        return measurements.power;
    }
  }

  async aggregate(options: {
    metric: MetricKey;
    granularity: Granularity;
    from?: string;
    to?: string;
  }) {
    const col = this.getMetricColumn(options.metric);
    const granularitySql =
      options.granularity === 'day'
        ? sql`'day'`
        : options.granularity === 'month'
          ? sql`'month'`
          : sql`'year'`;

    const conditions: any[] = [];
    if (options.from) {
      conditions.push(sql`${measurements.date} >= ${options.from}`);
    }
    if (options.to) {
      conditions.push(sql`${measurements.date} < ${options.to}`);
    }

    const where =
      conditions.length > 0
        ? sql`where ${sql.join(conditions, sql` and `)}`
        : sql``;

    const query = sql`
      select
        date_trunc(${granularitySql}, ${measurements.date}) as bucket,
        avg(${col}) as value
      from ${measurements}
      ${where}
      group by bucket
      order by bucket;
    `;

    const result = await this.db.execute(query);
    return result.rows.map((r: any) => ({
      bucket: r.bucket,
      value: r.value === null ? null : Number(r.value),
    }));
  }

  async today(metric: MetricKey) {
    const col = this.getMetricColumn(metric);
    const query = sql`
      select
        ${measurements.date} as ts,
        ${col} as value
      from ${measurements}
      where ${measurements.date} >= date_trunc('day', now())
      order by ${measurements.date};
    `;
    const result = await this.db.execute(query);
    return result.rows.map((r: any) => ({
      ts: r.ts,
      value: r.value === null ? null : Number(r.value),
    }));
  }
}

