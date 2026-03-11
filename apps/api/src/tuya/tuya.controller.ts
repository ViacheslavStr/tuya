import { Controller, Get } from '@nestjs/common';
import { TuyaService } from './tuya.service';

@Controller('tuya')
export class TuyaController {
  constructor(private readonly tuya: TuyaService) {}

  @Get('metrics')
  async metrics() {
    return this.tuya.getDeviceMetrics();
  }
}
