"use strict";

require("../helpers/test-env");

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sharp = require("sharp");

const { prisma, disconnectDatabase } = require("../helpers/test-db");
const {
  createUser,
  createCompany,
  createCompanyMember,
  createCompanyWithOwner,
} = require("../helpers/test-factory");

const authAvatarService = require("../../src/modules/auth/auth.avatar.service");
const { AUTH_AVATAR_CONSTANTS } = require("../../src/modules/auth/auth.avatar.constants");
const { AuthDto } = require("../../src/modules/auth/auth.dto");
const { AuthMapper } = require("../../src/modules/auth/auth.mapper");
const companyRepository = require("../../src/modules/company/company.repository");
const companyMapper = require("../../src/modules/company/company.mapper");

test.after(async () => {
  await disconnectDatabase();
});

// Helper to create a valid test image buffer
async function createTestImageBuffer(format = "png", width = 100, height = 100) {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 78, g: 53, b: 232, alpha: 1 },
    },
  });

  if (format === "jpeg" || format === "jpg") {
    return image.jpeg().toBuffer();
  }
  if (format === "webp") {
    return image.webp().toBuffer();
  }
  return image.png().toBuffer();
}

test("Profile Photo & Avatar Feature Suite", async (t) => {
  // Test 1: Owner can upload and display their own photo
  await t.test("1. Owner can upload, process, and display their own profile photo", async () => {
    const { owner } = await createCompanyWithOwner({ companyName: `Facebook Inc ${crypto.randomUUID()}` });
    const imageBuffer = await createTestImageBuffer("png", 200, 200);

    const file = {
      mimetype: "image/png",
      buffer: imageBuffer,
      size: imageBuffer.length,
    };

    const result = await authAvatarService.uploadAvatar(owner.id, file);

    assert.ok(result.avatarUrl, "avatarUrl should be populated");
    assert.ok(result.avatarPath, "avatarPath should be populated");
    assert.ok(result.avatarPath.includes(owner.id), "avatarPath should contain the owner userId");
    assert.ok(result.avatarUrl.includes("profile-photos"), "avatarUrl should reference the profile-photos bucket");

    // Verify database record
    const updatedUser = await prisma.user.findUnique({ where: { id: owner.id } });
    assert.strictEqual(updatedUser.avatarUrl, result.avatarUrl);
    assert.strictEqual(updatedUser.avatarPath, result.avatarPath);
  });

  // Test 2: HR can upload and display their own photo
  await t.test("2. HR / Recruiter can upload and display their own profile photo", async () => {
    const hrUser = await createUser({ name: "HR Specialist" });
    const imageBuffer = await createTestImageBuffer("jpeg", 150, 150);

    const file = {
      mimetype: "image/jpeg",
      buffer: imageBuffer,
      size: imageBuffer.length,
    };

    const result = await authAvatarService.uploadAvatar(hrUser.id, file);

    assert.ok(result.avatarUrl);
    assert.strictEqual(result.user.id, hrUser.id);

    const fetched = await prisma.user.findUnique({ where: { id: hrUser.id } });
    assert.strictEqual(fetched.avatarUrl, result.avatarUrl);
  });

  // Test 3: One user cannot replace another user's photo
  await t.test("3. Upload authorization is strictly scoped: user A cannot modify user B's avatar", async () => {
    const userA = await createUser({ name: "Alice" });
    const userB = await createUser({ name: "Bob" });

    const imgA = await createTestImageBuffer("webp", 80, 80);
    const resultA = await authAvatarService.uploadAvatar(userA.id, {
      mimetype: "image/webp",
      buffer: imgA,
      size: imgA.length,
    });

    // When User B uploads, User B's session ID is passed
    const imgB = await createTestImageBuffer("png", 80, 80);
    const resultB = await authAvatarService.uploadAvatar(userB.id, {
      mimetype: "image/png",
      buffer: imgB,
      size: imgB.length,
    });

    // Verify User A's avatar is completely untouched
    const freshUserA = await prisma.user.findUnique({ where: { id: userA.id } });
    assert.strictEqual(freshUserA.avatarUrl, resultA.avatarUrl);
    assert.strictEqual(freshUserA.avatarPath, resultA.avatarPath);
    assert.notStrictEqual(freshUserA.avatarUrl, resultB.avatarUrl);
  });

  // Test 4: Facebook, Oracle and Microsoft users remain isolated
  await t.test("4. Multi-tenant isolation: Facebook, Oracle and Microsoft members remain isolated", async () => {
    const { company: facebook, owner: fbOwner } = await createCompanyWithOwner({ companyName: `Facebook ${crypto.randomUUID()}` });
    const { company: oracle, owner: oracleOwner } = await createCompanyWithOwner({ companyName: `Oracle ${crypto.randomUUID()}` });
    const { company: _microsoft, owner: msOwner } = await createCompanyWithOwner({ companyName: `Microsoft ${crypto.randomUUID()}` });

    // Upload distinct avatars
    const img = await createTestImageBuffer("png", 64, 64);
    await authAvatarService.uploadAvatar(fbOwner.id, { mimetype: "image/png", buffer: img, size: img.length });
    await authAvatarService.uploadAvatar(oracleOwner.id, { mimetype: "image/png", buffer: img, size: img.length });
    await authAvatarService.uploadAvatar(msOwner.id, { mimetype: "image/png", buffer: img, size: img.length });

    // Fetch members for Facebook
    const fbMembers = await companyRepository.findCompanyMembers(facebook.id);
    assert.ok(fbMembers.some((m) => m.userId === fbOwner.id));
    assert.ok(!fbMembers.some((m) => m.userId === oracleOwner.id));
    assert.ok(!fbMembers.some((m) => m.userId === msOwner.id));

    // Fetch members for Oracle
    const oracleMembers = await companyRepository.findCompanyMembers(oracle.id);
    assert.ok(oracleMembers.some((m) => m.userId === oracleOwner.id));
    assert.ok(!oracleMembers.some((m) => m.userId === fbOwner.id));

    // Verify mapped member contains correct personal avatar
    const mappedFbMember = companyMapper.mapCompanyMember(fbMembers[0]);
    assert.ok(mappedFbMember.avatarUrl, "Company member listing must expose member's personal avatarUrl");
  });

  // Test 5: Shared user identity across companies displays the same personal avatar
  await t.test("5. Shared user identity across multiple companies displays the identical personal avatar", async () => {
    const sharedUser = await createUser({ name: "Consultant User" });

    const company1 = await createCompany({ name: `Client Alpha ${crypto.randomUUID()}` });
    const company2 = await createCompany({ name: `Client Beta ${crypto.randomUUID()}` });

    await createCompanyMember({ companyId: company1.id, userId: sharedUser.id, role: "RECRUITER" });
    await createCompanyMember({ companyId: company2.id, userId: sharedUser.id, role: "RECRUITER" });

    // Upload avatar once for shared user
    const img = await createTestImageBuffer("webp", 120, 120);
    const { avatarUrl } = await authAvatarService.uploadAvatar(sharedUser.id, {
      mimetype: "image/webp",
      buffer: img,
      size: img.length,
    });

    // Check Company 1 member list
    const comp1Members = await companyRepository.findCompanyMembers(company1.id);
    const member1 = comp1Members.find((m) => m.userId === sharedUser.id);
    assert.strictEqual(member1.user.avatarUrl, avatarUrl);

    // Check Company 2 member list
    const comp2Members = await companyRepository.findCompanyMembers(company2.id);
    const member2 = comp2Members.find((m) => m.userId === sharedUser.id);
    assert.strictEqual(member2.user.avatarUrl, avatarUrl);
  });

  // Test 6: Replacing an avatar does not change other users' avatars
  await t.test("6. Replacing an avatar updates only the target user and leaves others intact", async () => {
    const user1 = await createUser({ name: "User One" });
    const user2 = await createUser({ name: "User Two" });

    const img1 = await createTestImageBuffer("png", 50, 50);
    const img2 = await createTestImageBuffer("jpeg", 50, 50);

    const _res1Initial = await authAvatarService.uploadAvatar(user1.id, {
      mimetype: "image/png",
      buffer: img1,
      size: img1.length,
    });
    const res2Initial = await authAvatarService.uploadAvatar(user2.id, {
      mimetype: "image/jpeg",
      buffer: img2,
      size: img2.length,
    });

    // User 1 replaces their avatar with a new image
    const img1Replacement = await createTestImageBuffer("webp", 100, 100);
    const res1Replaced = await authAvatarService.uploadAvatar(user1.id, {
      mimetype: "image/webp",
      buffer: img1Replacement,
      size: img1Replacement.length,
    });

    // Verify User 1 updated
    const fresh1 = await prisma.user.findUnique({ where: { id: user1.id } });
    assert.strictEqual(fresh1.avatarUrl, res1Replaced.avatarUrl);

    // Verify User 2 remained completely untouched
    const fresh2 = await prisma.user.findUnique({ where: { id: user2.id } });
    assert.strictEqual(fresh2.avatarUrl, res2Initial.avatarUrl);
    assert.strictEqual(fresh2.avatarPath, res2Initial.avatarPath);
  });

  // Test 7: Removing an avatar correctly shows the default initials avatar
  await t.test("7. Removing an avatar resets avatarUrl and avatarPath to null", async () => {
    const user = await createUser({ name: "Removable Avatar User" });
    const img = await createTestImageBuffer("png", 60, 60);

    await authAvatarService.uploadAvatar(user.id, {
      mimetype: "image/png",
      buffer: img,
      size: img.length,
    });

    // Remove avatar
    const removalResult = await authAvatarService.removeAvatar(user.id);
    assert.strictEqual(removalResult.avatarUrl, null);
    assert.strictEqual(removalResult.avatarPath, null);
    assert.strictEqual(removalResult.user.avatarUrl, null);

    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    assert.strictEqual(freshUser.avatarUrl, null);
    assert.strictEqual(freshUser.avatarPath, null);
  });

  // Test 8: Invalid file types and files over 5 MB are rejected
  await t.test("8. Validation rejects invalid file types and oversized files (> 5MB)", async () => {
    const user = await createUser({ name: "Validation Tester" });

    // Text file pretending to be image
    const fakeTextFile = {
      mimetype: "text/plain",
      buffer: Buffer.from("Hello world, this is a plain text file."),
      size: 40,
    };
    await assert.rejects(
      () => authAvatarService.uploadAvatar(user.id, fakeTextFile),
      (err) => err.code === AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE
    );

    // Corrupt binary pretending to be image/png
    const corruptImage = {
      mimetype: "image/png",
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]),
      size: 5,
    };
    await assert.rejects(
      () => authAvatarService.uploadAvatar(user.id, corruptImage),
      (err) => err.code === AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_IMAGE
    );

    // Oversized buffer > 5MB
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const oversizedFile = {
      mimetype: "image/png",
      buffer: oversizedBuffer,
      size: oversizedBuffer.length,
    };
    await assert.rejects(
      () => authAvatarService.uploadAvatar(user.id, oversizedFile),
      (err) => err.code === AUTH_AVATAR_CONSTANTS.ERROR_CODES.FILE_TOO_LARGE
    );
  });

  // Test 9: Existing authentication and profile functionality still works
  await t.test("9. Existing auth DTOs, mappers, and profile responses remain 100% backward-compatible", async () => {
    const user = await createUser({ name: "Compatibility Tester" });

    // DTO mapping without avatar
    const dtoResponseBefore = AuthDto.toResponse(user);
    assert.strictEqual(dtoResponseBefore.id, user.id);
    assert.strictEqual(dtoResponseBefore.email, user.email);
    assert.strictEqual(dtoResponseBefore.avatarUrl, null);

    // Mapper mapping without avatar
    const mapperResponseBefore = AuthMapper.toUserResponse(user);
    assert.strictEqual(mapperResponseBefore.id, user.id);
    assert.strictEqual(mapperResponseBefore.avatarUrl, null);

    // After uploading avatar
    const img = await createTestImageBuffer("png", 50, 50);
    const { avatarUrl } = await authAvatarService.uploadAvatar(user.id, {
      mimetype: "image/png",
      buffer: img,
      size: img.length,
    });

    const userWithAvatar = await prisma.user.findUnique({ where: { id: user.id } });
    const dtoResponseAfter = AuthDto.toResponse(userWithAvatar);
    assert.strictEqual(dtoResponseAfter.avatarUrl, avatarUrl);

    const mapperResponseAfter = AuthMapper.toUserResponse(userWithAvatar);
    assert.strictEqual(mapperResponseAfter.avatarUrl, avatarUrl);
  });
});
