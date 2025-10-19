/*
  Warnings:

  - You are about to drop the column `action` on the `agent_messages` table. All the data in the column will be lost.
  - You are about to drop the column `message_type` on the `agent_messages` table. All the data in the column will be lost.
  - Added the required column `priority` to the `agent_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `agent_messages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "vsl_frontend"."agent_messages" DROP COLUMN "action",
DROP COLUMN "message_type",
ADD COLUMN     "priority" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ALTER COLUMN "content" SET DATA TYPE TEXT;
