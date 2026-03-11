import { Module } from '@nestjs/common';
import { TuyaController } from './tuya.controller';
import { TuyaService } from './tuya.service';
import { TuyaSyncSchedule } from './tuya-sync.schedule';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [TuyaController],
  providers: [TuyaService, TuyaSyncSchedule],
})
export class TuyaModule {}
