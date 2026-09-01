-- CreateEnum
CREATE TYPE "public"."AssessmentAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."AttemptEvaluationStatus" AS ENUM ('CORRECT', 'INCORRECT', 'UNANSWERED');

-- CreateTable
CREATE TABLE "public"."AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "public"."AssessmentAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "score" DECIMAL(12,2),
    "percentage" DECIMAL(5,2),
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AttemptQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "marks" DECIMAL(10,2) NOT NULL,
    "negativeMarks" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" JSONB,
    "answerText" TEXT,
    "evaluationStatus" "public"."AttemptEvaluationStatus",
    "isCorrect" BOOLEAN,
    "marksAwarded" DECIMAL(10,2),
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentAttempt_candidateId_status_idx" ON "public"."AssessmentAttempt"("candidateId", "status");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_candidateId_idx" ON "public"."AssessmentAttempt"("assessmentId", "candidateId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_status_expiresAt_idx" ON "public"."AssessmentAttempt"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_candidateId_createdAt_idx" ON "public"."AssessmentAttempt"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_candidateId_attemptNumber_key" ON "public"."AssessmentAttempt"("assessmentId", "candidateId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AttemptQuestion_attemptId_sequence_idx" ON "public"."AttemptQuestion"("attemptId", "sequence");

-- CreateIndex
CREATE INDEX "AttemptQuestion_questionId_idx" ON "public"."AttemptQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_questionId_key" ON "public"."AttemptQuestion"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptQuestion_attemptId_sequence_key" ON "public"."AttemptQuestion"("attemptId", "sequence");

-- CreateIndex
CREATE INDEX "AttemptAnswer_attemptId_idx" ON "public"."AttemptAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_questionId_idx" ON "public"."AttemptAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_questionId_key" ON "public"."AttemptAnswer"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "public"."AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "public"."Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttemptQuestion" ADD CONSTRAINT "AttemptQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_questionId_fkey" FOREIGN KEY ("attemptId", "questionId") REFERENCES "public"."AttemptQuestion"("attemptId", "questionId") ON DELETE CASCADE ON UPDATE CASCADE;
