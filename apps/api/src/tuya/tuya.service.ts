import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { TuyaRegion, TuyaResponse, TuyaStatusItem } from './tuya.types';
import type { Db } from '../db/db.module';
import { DRIZZLE } from '../db/db.module';
import { measurements } from '../db/schema';

type CachedToken = {
  value: string;
  expiresAtMs: number;
};

@Injectable()
export class TuyaService {
  private tokenCache: CachedToken | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: Db,
  ) {}

  private get region(): TuyaRegion {
    return (this.config.get<string>('TUYA_REGION') ?? 'EU') as TuyaRegion;
  }

  private get baseUrl(): string {
    const explicit = this.config.get<string>('TUYA_BASE_URL');
    if (explicit) return explicit.replace(/\/+$/, '');

    switch (this.region) {
      case 'EU':
        return 'https://openapi.tuyaeu.com';
      case 'US':
        return 'https://openapi.tuyaus.com';
      case 'CN':
        return 'https://openapi.tuyacn.com';
      case 'IN':
        return 'https://openapi.tuyain.com';
      default:
        return 'https://openapi.tuyaeu.com';
    }
  }

  private mustGet(name: string): string {
    const v = this.config.get<string>(name);
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
  }

  private sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private hmacSha256UpperHex(secret: string, message: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex')
      .toUpperCase();
  }

  private buildStringToSign(opts: {
    method: string;
    urlPathWithQuery: string;
    body: string;
    signatureHeaders?: Record<string, string>;
  }): string {
    const method = opts.method.toUpperCase();
    const contentSha256 = this.sha256Hex(opts.body ?? '');

    const headers = opts.signatureHeaders ?? {};
    const headerLines = Object.keys(headers)
      .sort()
      .map((k) => `${k}:${headers[k]}`);
    const headersString = headerLines.join('\n');

    // method + '\n' + contentSha256 + '\n' + headersString + '\n' + url
    return [method, contentSha256, headersString, opts.urlPathWithQuery].join(
      '\n',
    );
  }

  private buildSignedHeaders(opts: {
    method: string;
    urlPathWithQuery: string;
    body?: unknown;
    accessToken?: string;
  }): Record<string, string> {
    const clientId = this.mustGet('TUYA_ACCESS_ID');
    const secret = this.mustGet('TUYA_ACCESS_SECRET');

    const t = Date.now().toString();
    const nonce = crypto.randomUUID();

    const bodyStr = opts.body === undefined ? '' : JSON.stringify(opts.body);
    const stringToSign = this.buildStringToSign({
      method: opts.method,
      urlPathWithQuery: opts.urlPathWithQuery,
      body: bodyStr,
    });

    const accessToken = opts.accessToken ?? '';
    const signStr = `${clientId}${accessToken}${t}${nonce}${stringToSign}`;
    const sign = this.hmacSha256UpperHex(secret, signStr);

    const headers: Record<string, string> = {
      client_id: clientId,
      t: t,
      sign_method: 'HMAC-SHA256',
      nonce: nonce,
      sign: sign,
    };

    if (opts.accessToken) headers['access_token'] = opts.accessToken;
    if (bodyStr) headers['Content-Type'] = 'application/json';

    return headers;
  }

  private async tuyaFetch<T>(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    pathWithQuery: string;
    body?: unknown;
    accessToken?: string;
  }): Promise<TuyaResponse<T>> {
    const headers = this.buildSignedHeaders({
      method: opts.method,
      urlPathWithQuery: opts.pathWithQuery,
      body: opts.body,
      accessToken: opts.accessToken,
    });

    const res = await fetch(`${this.baseUrl}${opts.pathWithQuery}`, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    const json = (await res.json()) as TuyaResponse<T>;
    if (!res.ok || !json?.success) {
      const msg = json?.msg ? `: ${json.msg}` : '';
      throw new Error(`Tuya API error (${res.status})${msg}`);
    }
    return json;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAtMs) {
      return this.tokenCache.value;
    }

    // Token management API: access_token is empty in signStr, but we still include nonce and stringToSign.
    const tokenRes = await this.tuyaFetch<{
      access_token: string;
      expire_time: number;
    }>({
      method: 'GET',
      pathWithQuery: '/v1.0/token?grant_type=1',
    });

    const token = tokenRes.result.access_token;
    const expireSeconds = tokenRes.result.expire_time;
    // refresh 60s earlier
    this.tokenCache = {
      value: token,
      expiresAtMs: Date.now() + Math.max(0, expireSeconds - 60) * 1000,
    };
    return token;
  }

  private pickFirstNumber(
    status: TuyaStatusItem[],
    codes: string[],
  ): number | null {
    for (const code of codes) {
      const item = status.find((s) => s.code === code);
      if (!item) continue;
      if (typeof item.value === 'number') return item.value;
      if (
        typeof item.value === 'string' &&
        item.value.trim() !== '' &&
        !Number.isNaN(Number(item.value))
      ) {
        return Number(item.value);
      }
    }
    return null;
  }

  async getDeviceMetrics() {
    const deviceId = this.mustGet('TUYA_DEVICE_ID');
    const token = await this.getAccessToken();
    const now = new Date();

    const statusRes = await this.tuyaFetch<TuyaStatusItem[]>({
      method: 'GET',
      pathWithQuery: `/v1.0/devices/${encodeURIComponent(deviceId)}/status`,
      accessToken: token,
    });

    const status = statusRes.result;

    const current = this.pickFirstNumber(status, [
      'cur_current',
      'current',
      'curCurrent',
      'i',
      'electric_current',
    ]);
    const voltage = this.pickFirstNumber(status, [
      'cur_voltage',
      'voltage',
      'curVoltage',
      'v',
    ]);
    const power = this.pickFirstNumber(status, [
      'cur_power',
      'power',
      'curPower',
      'p',
    ]);
    const energy = this.pickFirstNumber(status, [
      'add_ele',
      'energy',
      'electricity',
      'total_energy',
      'kwh',
      'wh',
    ]);
    const soc = this.pickFirstNumber(status, [
      'soc',
      'battery_percentage',
      'battery',
      'percent',
    ]);
    // best-effort запись в БД; ошибки не должны ломать основной ответ
    try {
      if (voltage !== null || current !== null || power !== null) {
        await this.db
          .insert(measurements)
          .values({
            date: now,
            voltage: voltage ?? null,
            current: current ?? null,
            power: power ?? null,
          })
          .onConflictDoNothing({ target: measurements.date });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert measurement', e);
    }

    return {
      deviceId,
      region: this.region,
      fetchedAt: now.toISOString(),
      metrics: {
        current,
        voltage,
        power,
        energy,
        soc,
      },
      status,
    };
  }

  /**
   * Читает логи DP (type=7) за указанный промежуток времени.
   * startMs / endMs — timestamp в миллисекундах.
   */
  private async fetchDpLogsRange(opts: {
    deviceId: string;
    accessToken: string;
    startMs: number;
    endMs: number;
    codes: string[];
  }): Promise<
    Array<{
      code: string;
      value: unknown;
      event_time: number;
    }>
  > {
    const { deviceId, accessToken, startMs, endMs, codes } = opts;
    const all: {
      code: string;
      value: unknown;
      event_time: number;
    }[] = [];

    let nextRowKey: string | undefined;
    // Ограничим количество итераций, чтобы не зациклиться при странном ответе.
    for (let i = 0; i < 10_000; i += 1) {
      const params = new URLSearchParams({
        type: '7',
        start_time: String(startMs),
        end_time: String(endMs),
        size: '100',
      });
      if (codes.length) {
        params.set('codes', codes.join(','));
      }
      if (nextRowKey) {
        params.set('start_row_key', nextRowKey);
      }

      const pathWithQuery = `/v1.0/devices/${encodeURIComponent(deviceId)}/logs?${params.toString()}`;

      const res = await this.tuyaFetch<{
        device_id: string;
        has_next: boolean;
        next_row_key?: string;
        logs: {
          code: string;
          value: unknown;
          event_time: number;
        }[];
      }>({
        method: 'GET',
        pathWithQuery,
        accessToken,
      });

      const { logs, has_next, next_row_key } = res.result ?? {
        logs: [],
        has_next: false,
      };

      if (logs?.length) {
        all.push(...logs);
      }

      if (!has_next || !next_row_key) {
        break;
      }

      nextRowKey = next_row_key;
    }

    return all;
  }

  /**
   * Одноразовая синхронизация истории по логам DP в measurements.
   * Пишем отдельную строку на каждое событие, заполняя только одно из полей
   * voltage / current / power в зависимости от кода DP.
   */
  async syncHistoryFromLogs(start: Date, end: Date): Promise<{ inserted: number }> {
    const deviceId = this.mustGet('TUYA_DEVICE_ID');
    const token = await this.getAccessToken();

    const startMs = start.getTime();
    const endMs = end.getTime();
    const logs = await this.fetchDpLogsRange({
      deviceId,
      accessToken: token,
      startMs,
      endMs,
      codes: ['cur_current', 'cur_voltage', 'cur_power'],
    });

    let inserted = 0;

    for (const log of logs) {
      const t = new Date(log.event_time);
      const num = typeof log.value === 'number' ? log.value : Number(log.value);
      if (Number.isNaN(num)) continue;

      let voltage: number | null = null;
      let current: number | null = null;
      let power: number | null = null;

      if (log.code === 'cur_voltage') voltage = num;
      else if (log.code === 'cur_current') current = num;
      else if (log.code === 'cur_power') power = num;
      else continue;

      await this.db
        .insert(measurements)
        .values({
          date: t,
          voltage,
          current,
          power,
        })
        .onConflictDoNothing({ target: measurements.date });

      inserted += 1;
    }

    return { inserted };
  }

  /** Вытянуть историю за последний год и сохранить её в measurements. */
  async syncHistoryYearFromLogs(): Promise<{ inserted: number }> {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    return this.syncHistoryFromLogs(start, end);
  }

  /** Вытянуть историю за вчера и сохранить её в measurements. */
  async syncHistoryYesterdayFromLogs(): Promise<{ inserted: number }> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
    end.setDate(end.getDate() + 1);
    return this.syncHistoryFromLogs(start, end);
  }
}
