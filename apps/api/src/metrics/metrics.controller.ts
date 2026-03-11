import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('aggregate')
  async aggregate(
    @Query('metric') metric = 'power',
    @Query('granularity') granularity = 'day',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metrics.aggregate({
      metric,
      granularity,
      from,
      to,
    } as any);
  }

  @Get('today')
  async today(@Query('metric') metric = 'power') {
    return this.metrics.today(metric as any);
  }
}

