CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "SourceKind" AS ENUM ('presence', 'temperature', 'humidity', 'voltage', 'current', 'climate_state');
CREATE TYPE "ReadingStatus" AS ENUM ('ok', 'unavailable');
CREATE TYPE "ReadingOrigin" AS ENUM ('hardware', 'simulated');
CREATE TYPE "CommandStatus" AS ENUM ('pending', 'delivered', 'capturing', 'completed', 'failed', 'rejected', 'unknown_after_restart', 'expired');

CREATE TABLE "departments" (
    "id" UUID NOT NULL, "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "rooms" (
    "id" UUID NOT NULL, "subject_id" VARCHAR(64) NOT NULL, "name" VARCHAR(100) NOT NULL,
    "department_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "devices" (
    "id" VARCHAR(64) NOT NULL, "name" VARCHAR(100) NOT NULL, "token_hash" CHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true, "room_id" UUID, "firmware_version" VARCHAR(32),
    "last_boot_id" VARCHAR(64), "last_seen_at" TIMESTAMPTZ(3), "interval_ms" INTEGER NOT NULL DEFAULT 5000,
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    "telemetry" JSONB, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sensor_sources" (
    "id" VARCHAR(64) NOT NULL, "name" VARCHAR(100) NOT NULL, "kind" "SourceKind" NOT NULL,
    "token_hash" CHAR(64) NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "room_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "sensor_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "readings" (
    "id" UUID NOT NULL, "event_id" VARCHAR(64) NOT NULL, "source_id" VARCHAR(64) NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL, "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(3) NOT NULL, "value" JSONB, "unit" VARCHAR(24) NOT NULL,
    "status" "ReadingStatus" NOT NULL, "origin" "ReadingOrigin" NOT NULL,
    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "commands" (
    "id" VARCHAR(64) NOT NULL, "sequence" BIGINT NOT NULL, "device_id" VARCHAR(64) NOT NULL,
    "type" VARCHAR(48) NOT NULL, "payload" JSONB NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'pending', "boot_id" VARCHAR(64), "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3), "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
CREATE UNIQUE INDEX "rooms_subject_id_key" ON "rooms"("subject_id");
CREATE UNIQUE INDEX "rooms_department_id_name_key" ON "rooms"("department_id", "name");
CREATE UNIQUE INDEX "readings_event_id_key" ON "readings"("event_id");
CREATE INDEX "readings_source_id_observed_at_idx" ON "readings"("source_id", "observed_at" DESC);
CREATE INDEX "commands_device_id_status_sequence_idx" ON "commands"("device_id", "status", "sequence");
CREATE UNIQUE INDEX "commands_device_id_sequence_key" ON "commands"("device_id", "sequence");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sensor_sources" ADD CONSTRAINT "sensor_sources_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "readings" ADD CONSTRAINT "readings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sensor_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commands" ADD CONSTRAINT "commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O schema public e exposto pela Data API do Supabase. Sem policies, RLS bloqueia
-- acesso via anon/authenticated; o backend usa uma conexao PostgreSQL privilegiada.
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sensor_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commands" ENABLE ROW LEVEL SECURITY;
