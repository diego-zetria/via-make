-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "vsl_frontend";

-- CreateTable
CREATE TABLE "vsl_frontend"."novelas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "genre" TEXT,
    "target_episodes" INTEGER NOT NULL,
    "created_videos" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(10,2),
    "default_model_id" TEXT,
    "defaultDuration" INTEGER NOT NULL DEFAULT 8,
    "defaultResolution" TEXT NOT NULL DEFAULT '1080p',
    "default_aspect_ratio" TEXT NOT NULL DEFAULT '16:9',
    "reference_character_images" JSONB,
    "master_seed" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vsl_frontend"."novela_videos" (
    "id" TEXT NOT NULL,
    "novela_id" TEXT NOT NULL,
    "scene_number" INTEGER NOT NULL,
    "title" TEXT,
    "prompt" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "resolution" TEXT NOT NULL,
    "aspect_ratio" TEXT NOT NULL,
    "seed" INTEGER,
    "reference_images" JSONB,
    "replicate_job_id" TEXT,
    "lambda_request_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "video_url" TEXT,
    "cost" DECIMAL(10,2),
    "processing_time" INTEGER,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "novela_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vsl_frontend"."agent_messages" (
    "id" TEXT NOT NULL,
    "novela_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "from_agent" TEXT NOT NULL,
    "to_agent" TEXT,
    "message_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vsl_frontend"."user_chat_messages" (
    "id" TEXT NOT NULL,
    "novela_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agent_type" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vsl_frontend"."media_library" (
    "id" TEXT NOT NULL,
    "novela_id" TEXT,
    "s3_key" TEXT NOT NULL,
    "s3_url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filesize" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "metadata" JSONB,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_library_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "novelas_status_idx" ON "vsl_frontend"."novelas"("status");

-- CreateIndex
CREATE INDEX "novela_videos_novela_id_idx" ON "vsl_frontend"."novela_videos"("novela_id");

-- CreateIndex
CREATE INDEX "novela_videos_status_idx" ON "vsl_frontend"."novela_videos"("status");

-- CreateIndex
CREATE INDEX "novela_videos_replicate_job_id_idx" ON "vsl_frontend"."novela_videos"("replicate_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "novela_videos_novela_id_scene_number_key" ON "vsl_frontend"."novela_videos"("novela_id", "scene_number");

-- CreateIndex
CREATE INDEX "agent_messages_novela_id_idx" ON "vsl_frontend"."agent_messages"("novela_id");

-- CreateIndex
CREATE INDEX "agent_messages_conversation_id_idx" ON "vsl_frontend"."agent_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_messages_from_agent_idx" ON "vsl_frontend"."agent_messages"("from_agent");

-- CreateIndex
CREATE INDEX "agent_messages_timestamp_idx" ON "vsl_frontend"."agent_messages"("timestamp");

-- CreateIndex
CREATE INDEX "user_chat_messages_novela_id_idx" ON "vsl_frontend"."user_chat_messages"("novela_id");

-- CreateIndex
CREATE INDEX "user_chat_messages_timestamp_idx" ON "vsl_frontend"."user_chat_messages"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "media_library_s3_key_key" ON "vsl_frontend"."media_library"("s3_key");

-- CreateIndex
CREATE INDEX "media_library_novela_id_idx" ON "vsl_frontend"."media_library"("novela_id");

-- CreateIndex
CREATE INDEX "media_library_s3_key_idx" ON "vsl_frontend"."media_library"("s3_key");

-- CreateIndex
CREATE INDEX "media_library_created_at_idx" ON "vsl_frontend"."media_library"("created_at");

-- AddForeignKey
ALTER TABLE "vsl_frontend"."novela_videos" ADD CONSTRAINT "novela_videos_novela_id_fkey" FOREIGN KEY ("novela_id") REFERENCES "vsl_frontend"."novelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vsl_frontend"."agent_messages" ADD CONSTRAINT "agent_messages_novela_id_fkey" FOREIGN KEY ("novela_id") REFERENCES "vsl_frontend"."novelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vsl_frontend"."user_chat_messages" ADD CONSTRAINT "user_chat_messages_novela_id_fkey" FOREIGN KEY ("novela_id") REFERENCES "vsl_frontend"."novelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vsl_frontend"."media_library" ADD CONSTRAINT "media_library_novela_id_fkey" FOREIGN KEY ("novela_id") REFERENCES "vsl_frontend"."novelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
