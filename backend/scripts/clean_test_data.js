const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function cleanTestData() {
  console.log("Cleaning up test records from Database...");

  const deletedAttempts = await prisma.candidateAttempt.deleteMany({
    where: {
      OR: [
        { assessment: { title: { contains: "Expiry Test" } } },
        { candidate: { email: { startsWith: "expiry-test-" } } },
      ],
    },
  });
  console.log(`Deleted ${deletedAttempts.count} test attempts.`);

  const deletedAssessmentQuestions = await prisma.assessmentQuestion.deleteMany({
    where: {
      assessment: { title: { contains: "Expiry Test" } },
    },
  });
  console.log(`Deleted ${deletedAssessmentQuestions.count} test assessment questions.`);

  const deletedAssessments = await prisma.assessment.deleteMany({
    where: {
      title: { contains: "Expiry Test" },
    },
  });
  console.log(`Deleted ${deletedAssessments.count} test assessments.`);

  const deletedQuestions = await prisma.question.deleteMany({
    where: {
      OR: [
        { title: { contains: "What is Linux ?" } },
        { title: { contains: "what is sql ?" } },
        { title: { contains: "what is Django ?" } },
        { title: { contains: "what is .Net ?" } },
        { title: { contains: "What id Database ?" } },
        { title: { contains: "What is Nodejs ?" } },
        { title: { contains: "what is React ?" } },
        { title: { contains: "what is 2+2 ?" } },
        { title: { contains: "When does a browser" } },
        { title: { contains: "Which ACID property" } },
        { title: { contains: "In Node.js asynchronous" } },
        { title: { contains: "In React, when does" } },
        { title: { contains: "What will be the output" } },
      ],
    },
  });
  console.log(`Deleted ${deletedQuestions.count} test questions.`);

  const deletedProfiles = await prisma.candidateProfile.deleteMany({
    where: {
      email: { startsWith: "expiry-test-" },
    },
  });
  console.log(`Deleted ${deletedProfiles.count} test candidate profiles.`);

  const deletedUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { startsWith: "expiry-test-" } },
        { name: "Expiry Tester" },
      ],
    },
  });
  console.log(`Deleted ${deletedUsers.count} test users.`);

  console.log("Cleanup complete!");
  await prisma.$disconnect();
}

cleanTestData().catch((err) => {
  console.error("Cleanup error:", err);
  prisma.$disconnect();
});
