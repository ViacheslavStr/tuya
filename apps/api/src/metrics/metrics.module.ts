import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [DbModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}

