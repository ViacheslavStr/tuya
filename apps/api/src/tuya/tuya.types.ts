export type TuyaRegion = 'EU' | 'US' | 'CN' | 'IN';

export type TuyaStatusItem = {
  code: string;
  value: unknown;
};

export type TuyaResponse<T> = {
  success: boolean;
  t: number;
  result: T;
  msg?: string;
  code?: number;
};
