const { test } = require('node:test');
const assert = require('node:assert');
const { ensureCandidateProfile } = require('../../../src/modules/resume/resume.repository');
const { prisma } = require('../../../src/config/prisma');

test('Candidate Profile Persistence', async (t) => {

  await t.test('Preserves existing candidate fields and metadata', async () => {
    // We will use a mock DB for this or just call it directly with a mock db object.

    const mockDb = {
      candidateProfile: {
        findUnique: async () => ({
          firstName: "ExistingFirst",
          lastName: "ExistingLast",
          metadata: {
            skills: ["Java", "Spring"],
            source: "LinkedIn"
          }
        }),
        upsert: async (args) => args
      }
    };

    const result = await ensureCandidateProfile(
      { id: "user1", email: "test@gmail.com", firstName: "ShouldNotOverride", lastName: "AlsoNo" },
      {
        skills: ["React.js", "Node.js"],
        phone: "1234567890"
      },
      "comp1",
      mockDb
    );

    assert.strictEqual(result.update.firstName, "ExistingFirst");
    assert.strictEqual(result.update.lastName, "ExistingLast");
    assert.ok(result.update.metadata.skills.includes("Java"));
    assert.ok(result.update.metadata.skills.includes("React.js"));
    assert.strictEqual(result.update.metadata.source, "LinkedIn");
    assert.strictEqual(result.update.phoneNumber, "1234567890");
  });

});
