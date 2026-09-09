"use strict";

require("dotenv").config();
const bcrypt = require("bcrypt");
const { prisma } = require("../src/config/prisma");

async function seedSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL || "admin@hirequest.com").trim().toLowerCase();
  const rawPassword = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123456";
  const name = process.env.SUPER_ADMIN_NAME || "Platform Super Admin";

  console.info(`[SuperAdminSeed] Starting seed for email: ${email}...`);

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    if (existingUser) {
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          password: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
        },
      });

      console.info(`[SuperAdminSeed] Existing user updated to SUPER_ADMIN successfully!`);
      console.info(JSON.stringify(updatedUser, null, 2));
      return updatedUser;
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    console.info(`[SuperAdminSeed] New SUPER_ADMIN created successfully!`);
    console.info(JSON.stringify(newUser, null, 2));
    return newUser;
  } catch (error) {
    console.error("[SuperAdminSeed] Failed to seed Super Admin:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedSuperAdmin()
  .then(() => {
    console.info("[SuperAdminSeed] Execution completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[SuperAdminSeed] Execution failed:", err);
    process.exit(1);
  });
