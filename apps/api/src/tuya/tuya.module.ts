import { Module } from '@nestjs/common';
import { TuyaController } from './tuya.controller';
import { TuyaService } from './tuya.service';

@Module({
  controllers: [TuyaController],
  providers: [TuyaService],
})
export class TuyaModule {}
