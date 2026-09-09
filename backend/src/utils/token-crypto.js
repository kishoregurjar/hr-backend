"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

const getEncryptionKey = () => {
  const envKey =
    process.env.OWNER_ACTIVATION_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "hirequest_super_admin_secret_key_32_bytes!!";

  return crypto.createHash("sha256").update(envKey).digest();
};

const encryptToken = (token) => {
  if (!token) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
};

const decryptToken = (encryptedToken) => {
  if (!encryptedToken) return "";
  const key = getEncryptionKey();
  const [ivBase64, authTagBase64, encryptedBase64] = encryptedToken.split(".");

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivBase64, "base64")
  );

  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

module.exports = {
  encryptToken,
  decryptToken,
};
