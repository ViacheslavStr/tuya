CREATE TABLE "measurements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"voltage" double precision,
	"current" double precision,
	"power" double precision,
	"energy" double precision
);

CREATE UNIQUE INDEX IF NOT EXISTS "measurements_date_idx" ON "measurements" ("date");