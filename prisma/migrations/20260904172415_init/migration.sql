-- CreateTable
CREATE TABLE "work_sessions" (
    "session_id" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "send_jobs" (
    "job_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "error" TEXT,
    "results_json" TEXT,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "send_jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "send_recipients" (
    "id" SERIAL NOT NULL,
    "job_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "recipient_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "send_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "total_emails" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "smtp_config_json" TEXT NOT NULL,
    "template_json" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" SERIAL NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "recipient_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_attachments" (
    "id" SERIAL NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "recipient_email" TEXT,
    "attachment_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "storage_url" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files_handler" (
    "id" SERIAL NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "session_id" TEXT,
    "job_id" TEXT,
    "chunk_index" INTEGER NOT NULL,
    "chunk_count" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_base64" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_handler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "send_tokens" (
    "id" TEXT NOT NULL,
    "gmail_token" TEXT,
    "outlook_tokens" TEXT,

    CONSTRAINT "send_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "send_jobs_status_scheduled_at_idx" ON "send_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "send_recipients_job_id_status_idx" ON "send_recipients"("job_id", "status");

-- CreateIndex
CREATE INDEX "send_recipients_job_id_email_idx" ON "send_recipients"("job_id", "email");

-- CreateIndex
CREATE INDEX "campaigns_user_id_created_at_idx" ON "campaigns"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_scheduled_at_idx" ON "campaign_recipients"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_email_key" ON "campaign_recipients"("campaign_id", "email");

-- CreateIndex
CREATE INDEX "campaign_attachments_campaign_id_idx" ON "campaign_attachments"("campaign_id");

-- CreateIndex
CREATE INDEX "files_handler_session_id_idx" ON "files_handler"("session_id");

-- CreateIndex
CREATE INDEX "files_handler_job_id_idx" ON "files_handler"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_handler_attachment_id_chunk_index_key" ON "files_handler"("attachment_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_attachments" ADD CONSTRAINT "campaign_attachments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
