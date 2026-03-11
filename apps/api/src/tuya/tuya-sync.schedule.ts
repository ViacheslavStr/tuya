import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TuyaService } from './tuya.service';

@Injectable()
export class TuyaSyncSchedule {
  constructor(private readonly tuya: TuyaService) {}

  /** Каждый день в 02:00 синхронизируем данные за вчера. */
  @Cron('0 2 * * *')
  async handleSyncYesterday() {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const result = await this.tuya.syncHistoryFromLogs(start, end);
      // eslint-disable-next-line no-console
      console.log(`[TuyaSync] dp logs synced: ${result.inserted} rows`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[TuyaSync] sync yesterday failed', e);
    }
  }
}
