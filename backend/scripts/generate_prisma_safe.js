"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
const tempSchemaPath = path.join(__dirname, "../prisma/schema.temp.prisma");

try {
  let schema = fs.readFileSync(schemaPath, "utf8");

  // Point generator to a temp output folder
  const tempOutputDir = path.join(__dirname, "../node_modules/.prisma/temp_client");
  const tempOutputEscaped = tempOutputDir.replace(/\\/g, "/");

  schema = schema.replace(
    /generator client \{[\s\S]*?\}/,
    `generator client {\n  provider = "prisma-client-js"\n  output   = "${tempOutputEscaped}"\n}`
  );

  fs.writeFileSync(tempSchemaPath, schema, "utf8");

  console.log("Generating Prisma client in temp folder...");
  execSync(`npx prisma generate --schema="${tempSchemaPath.replace(/\\/g, "/")}"`, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });

  console.log("Prisma generated into temp folder. Copying JS/TS files to .prisma/client...");
  const destDir = path.join(__dirname, "../node_modules/.prisma/client");

  const filesToCopy = ["index.js", "index.d.ts", "schema.prisma", "package.json"];
  for (const file of filesToCopy) {
    const srcFile = path.join(tempOutputDir, file);
    const destFile = path.join(destDir, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`  -> Copied ${file}`);
    }
  }

  // Also copy any runtime subfolders if present (excluding query_engine DLL)
  const items = fs.readdirSync(tempOutputDir);
  for (const item of items) {
    if (item.startsWith("query_engine")) continue;
    if (filesToCopy.includes(item)) continue;
    const srcPath = path.join(tempOutputDir, item);
    const destPath = path.join(destDir, item);
    if (fs.statSync(srcPath).isFile()) {
      try {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  -> Copied ${item}`);
      } catch (err) {
        console.warn(`  -> Skipped ${item}: ${err.message}`);
      }
    }
  }

  console.log("Cleaning up temp schema and temp directory...");
  fs.unlinkSync(tempSchemaPath);
  fs.rmSync(tempOutputDir, { recursive: true, force: true });

  console.log("SUCCESS: Prisma client safely updated without locking errors!");
} catch (error) {
  if (fs.existsSync(tempSchemaPath)) {
    fs.unlinkSync(tempSchemaPath);
  }
  console.error("Failed to generate Prisma client safely:", error);
  process.exit(1);
}

