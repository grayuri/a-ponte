-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COORDENADOR', 'INSTITUICAO', 'COLHEDOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ATIVO', 'INATIVO', 'CONVIDADO');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('ATIVO', 'SUSPENSO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PLANEJADA', 'CUMPRIDA', 'PENDENTE', 'JUSTIFICADA', 'REMANEJADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "HarvestSource" AS ENUM ('APP', 'IMPORTACAO', 'LANCAMENTO_MANUAL');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ESCALA_DO_DIA', 'COBRANCA_PENDENCIA', 'RESUMO_SEMANAL', 'PEDIDO_COBERTURA');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('NA_FILA', 'ENVIADA', 'FALHOU', 'CANCELADA');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'COLHEDOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ATIVO',
    "institution_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retail_chains" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "retail_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "chain_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shift_label" TEXT,
    "city" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "harvest_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_commitments" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "assignee_user_id" UUID,
    "harvest_type_id" UUID,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "time_label" TEXT,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ATIVO',
    "status_note" TEXT,
    "valid_from" DATE,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_occurrences" (
    "id" UUID NOT NULL,
    "commitment_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "store_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "assignee_user_id" UUID,
    "expected_time" VARCHAR(5) NOT NULL,
    "time_label" TEXT,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PLANEJADA',
    "status_reason" TEXT,
    "covering_institution_id" UUID,
    "covering_user_id" UUID,
    "pending_notified_at" TIMESTAMPTZ(6),
    "reminded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvests" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID,
    "store_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "harvest_type_id" UUID NOT NULL,
    "harvested_on" DATE NOT NULL,
    "harvested_at" VARCHAR(5),
    "weight_kg" DECIMAL(10,2) NOT NULL,
    "main_foods" TEXT,
    "photo_path" TEXT,
    "notes" TEXT,
    "collector_user_id" UUID,
    "legacy_collector_name" TEXT,
    "registered_by_user_id" UUID,
    "source" "HarvestSource" NOT NULL DEFAULT 'APP',
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'NA_FILA',
    "recipient_user_id" UUID,
    "recipient_address" TEXT NOT NULL,
    "recipient_name" TEXT,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "occurrence_id" UUID,
    "dedupe_key" TEXT,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_institution_id_idx" ON "users"("institution_id");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retail_chains_name_key" ON "retail_chains"("name");

-- CreateIndex
CREATE INDEX "stores_active_idx" ON "stores"("active");

-- CreateIndex
CREATE UNIQUE INDEX "stores_chain_id_name_shift_label_key" ON "stores"("chain_id", "name", "shift_label");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_name_key" ON "institutions"("name");

-- CreateIndex
CREATE INDEX "institutions_active_idx" ON "institutions"("active");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_types_code_key" ON "harvest_types"("code");

-- CreateIndex
CREATE INDEX "schedule_commitments_weekday_status_idx" ON "schedule_commitments"("weekday", "status");

-- CreateIndex
CREATE INDEX "schedule_commitments_store_id_idx" ON "schedule_commitments"("store_id");

-- CreateIndex
CREATE INDEX "schedule_commitments_institution_id_idx" ON "schedule_commitments"("institution_id");

-- CreateIndex
CREATE INDEX "schedule_occurrences_date_status_idx" ON "schedule_occurrences"("date", "status");

-- CreateIndex
CREATE INDEX "schedule_occurrences_store_id_date_idx" ON "schedule_occurrences"("store_id", "date");

-- CreateIndex
CREATE INDEX "schedule_occurrences_institution_id_date_idx" ON "schedule_occurrences"("institution_id", "date");

-- CreateIndex
CREATE INDEX "schedule_occurrences_assignee_user_id_date_idx" ON "schedule_occurrences"("assignee_user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_commitment_id_date_key" ON "schedule_occurrences"("commitment_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "harvests_external_ref_key" ON "harvests"("external_ref");

-- CreateIndex
CREATE INDEX "harvests_harvested_on_idx" ON "harvests"("harvested_on");

-- CreateIndex
CREATE INDEX "harvests_store_id_harvested_on_idx" ON "harvests"("store_id", "harvested_on");

-- CreateIndex
CREATE INDEX "harvests_institution_id_harvested_on_idx" ON "harvests"("institution_id", "harvested_on");

-- CreateIndex
CREATE INDEX "harvests_collector_user_id_harvested_on_idx" ON "harvests"("collector_user_id", "harvested_on");

-- CreateIndex
CREATE INDEX "harvests_harvest_type_id_harvested_on_idx" ON "harvests"("harvest_type_id", "harvested_on");

-- CreateIndex
CREATE INDEX "harvests_occurrence_id_idx" ON "harvests"("occurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_kind_channel_key" ON "notification_templates"("kind", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notifications_kind_created_at_idx" ON "notifications"("kind", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "retail_chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_commitments" ADD CONSTRAINT "schedule_commitments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_commitments" ADD CONSTRAINT "schedule_commitments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_commitments" ADD CONSTRAINT "schedule_commitments_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_commitments" ADD CONSTRAINT "schedule_commitments_harvest_type_id_fkey" FOREIGN KEY ("harvest_type_id") REFERENCES "harvest_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "schedule_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_covering_institution_id_fkey" FOREIGN KEY ("covering_institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_covering_user_id_fkey" FOREIGN KEY ("covering_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_harvest_type_id_fkey" FOREIGN KEY ("harvest_type_id") REFERENCES "harvest_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_collector_user_id_fkey" FOREIGN KEY ("collector_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
