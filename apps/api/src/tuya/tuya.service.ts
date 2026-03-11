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
        await this.db.insert(measurements).values({
          voltage: voltage ?? null,
          current: current ?? null,
          power: power ?? null,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert measurement', e);
    }

    return {
      deviceId,
      region: this.region,
      fetchedAt: new Date().toISOString(),
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
}
