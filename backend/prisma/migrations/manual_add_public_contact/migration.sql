-- CreateEnum
CREATE TYPE "PublicContactStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "PublicContactInquiry" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "PublicContactStatus" NOT NULL DEFAULT 'OPEN',
    "adminReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicContactInquiry_email_createdAt_idx" ON "PublicContactInquiry"("email", "createdAt");

-- CreateIndex
CREATE INDEX "PublicContactInquiry_status_createdAt_idx" ON "PublicContactInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PublicContactInquiry_createdAt_idx" ON "PublicContactInquiry"("createdAt");
