/*
  Warnings:

  - Added the required column `updated_at` to the `send_jobs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "send_jobs" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;
