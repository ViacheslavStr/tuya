import { Controller, Get, Post } from '@nestjs/common';
import { TuyaService } from './tuya.service';

@Controller('tuya')
export class TuyaController {
  constructor(private readonly tuya: TuyaService) {}

  @Get('metrics')
  async metrics() {
    return this.tuya.getDeviceMetrics();
  }

  /** Разовая синхронизация истории по логам DP за последний год. */
  @Post('sync/history-year')
  async syncHistoryYear() {
    return this.tuya.syncHistoryYearFromLogs();
  }

  /** Синхронизация истории по логам DP за вчера. */
  @Post('sync/history-yesterday')
  async syncHistoryYesterday() {
    return this.tuya.syncHistoryYesterdayFromLogs();
  }
}
