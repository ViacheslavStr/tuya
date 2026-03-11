-- База создаётся через POSTGRES_DB=tuya
-- Здесь создаём таблицу для измерений шунта.

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voltage DOUBLE PRECISION,
  current DOUBLE PRECISION,
  power DOUBLE PRECISION
);

