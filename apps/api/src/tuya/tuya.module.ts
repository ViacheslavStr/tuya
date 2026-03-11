import { Module } from '@nestjs/common';
import { TuyaController } from './tuya.controller';
import { TuyaService } from './tuya.service';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [TuyaController],
  providers: [TuyaService],
})
export class TuyaModule {}
