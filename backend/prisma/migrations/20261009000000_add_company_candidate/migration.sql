-- CreateTable
CREATE TABLE "CompanyCandidate" (
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCandidate_pkey" PRIMARY KEY ("companyId","candidateId")
);

-- CreateIndex
CREATE INDEX "CompanyCandidate_companyId_idx" ON "CompanyCandidate"("companyId");

-- CreateIndex
CREATE INDEX "CompanyCandidate_candidateId_idx" ON "CompanyCandidate"("candidateId");

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCandidate" ADD CONSTRAINT "CompanyCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data Backfill
INSERT INTO "CompanyCandidate" ("companyId", "candidateId", "createdAt")
SELECT "companyId", "id", "createdAt"
FROM "CandidateProfile"
WHERE "companyId" IS NOT NULL
ON CONFLICT DO NOTHING;
