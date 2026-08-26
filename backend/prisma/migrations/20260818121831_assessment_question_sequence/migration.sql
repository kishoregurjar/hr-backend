/*
  Warnings:

  - A unique constraint covering the columns `[assessmentId,sequence]` on the table `AssessmentQuestion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_sequence_key" ON "public"."AssessmentQuestion"("assessmentId", "sequence");
