"use strict";

const sharp = require("sharp");
const { prisma } = require("../../config/prisma");
const { AUTH_AVATAR_CONSTANTS } = require("./auth.avatar.constants");
const { uploadUserAvatar, deleteUserAvatar } = require("./auth.avatar.storage");
const AuthMapper = require("./auth.mapper");
const { clearUserCache } = require("../../middleware/requireAuth");

const createAvatarError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const validateUploadedFile = (file) => {
  if (!file) {
    throw createAvatarError(
      "Profile photo file is required.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.FILE_REQUIRED,
      400
    );
  }

  if (!AUTH_AVATAR_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw createAvatarError(
      "Invalid profile photo file type. Allowed formats: JPEG, PNG, WebP.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE,
      400
    );
  }

  if (file.size > AUTH_AVATAR_CONSTANTS.MAX_SIZE_BYTES) {
    throw createAvatarError(
      "Profile photo file size must not exceed 5 MB.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.FILE_TOO_LARGE,
      413
    );
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createAvatarError(
      "Profile photo file buffer is empty or invalid.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_IMAGE,
      400
    );
  }
};

const processAvatarImage = async (fileBuffer) => {
  let metadata;
  try {
    metadata = await sharp(fileBuffer).metadata();
  } catch (err) {
    const error = createAvatarError(
      "Invalid or corrupted image file.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_IMAGE,
      400
    );
    error.cause = err;
    throw error;
  }

  const validFormats = ["jpeg", "png", "webp"];
  if (!metadata?.format || !validFormats.includes(metadata.format)) {
    throw createAvatarError(
      `Unsupported image format: ${metadata?.format || "unknown"}. Allowed: JPEG, PNG, WebP.`,
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_FILE_TYPE,
      400
    );
  }

  try {
    return await sharp(fileBuffer)
      .rotate() // auto-orient based on EXIF
      .resize({
        width: AUTH_AVATAR_CONSTANTS.OUTPUT_WIDTH,
        height: AUTH_AVATAR_CONSTANTS.OUTPUT_HEIGHT,
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    const error = createAvatarError(
      "Failed to process and optimize image.",
      AUTH_AVATAR_CONSTANTS.ERROR_CODES.INVALID_IMAGE,
      400
    );
    error.cause = err;
    throw error;
  }
};

class AuthAvatarService {
  /**
   * Upload, optimize, and persist a user's profile photo in Supabase Storage.
   * Authorization: The userId is strictly derived from the authenticated session.
   */
  async uploadAvatar(userId, file) {
    if (!userId) {
      throw createAvatarError(
        "User authentication required.",
        AUTH_AVATAR_CONSTANTS.ERROR_CODES.UNAUTHORIZED,
        401
      );
    }

    validateUploadedFile(file);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw createAvatarError(
        "User account not found.",
        AUTH_AVATAR_CONSTANTS.ERROR_CODES.USER_NOT_FOUND,
        404
      );
    }

    const processedBuffer = await processAvatarImage(file.buffer);

    // Storage path inside profile-photos bucket: users/{userId}/avatar.webp
    const storagePath = `users/${userId}/avatar.webp`;

    const uploaded = await uploadUserAvatar({
      fileBuffer: processedBuffer,
      contentType: AUTH_AVATAR_CONSTANTS.OUTPUT_MIME_TYPE,
      storagePath,
    });

    // Append cache-busting timestamp so browser/CDN instantly reflects the new avatar
    const cacheBustedUrl = `${uploaded.publicUrl}?t=${Date.now()}`;

    const previousAvatarPath = user.avatarPath;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          avatarUrl: cacheBustedUrl,
          avatarPath: uploaded.storagePath,
        },
      });

      // Clear in-memory requireAuth cache so next request reads fresh user
      if (typeof clearUserCache === "function") {
        clearUserCache(userId);
      }

      // If previous storage path was different, clean it up safely
      if (
        previousAvatarPath &&
        previousAvatarPath !== uploaded.storagePath &&
        previousAvatarPath !== `profile-photos/${uploaded.storagePath}`
      ) {
        try {
          await deleteUserAvatar(previousAvatarPath);
        } catch (cleanupErr) {
          console.warn("Non-fatal: Failed to delete old avatar file", {
            userId,
            previousAvatarPath,
            error: cleanupErr.message,
          });
        }
      }

      return {
        user: AuthMapper.toUserResponse(updatedUser),
        avatarUrl: updatedUser.avatarUrl,
        avatarPath: updatedUser.avatarPath,
      };
    } catch (dbError) {
      // Rollback: Clean up newly uploaded file if database update failed
      try {
        await deleteUserAvatar(uploaded.storagePath);
      } catch (cleanupErr) {
        console.error("Failed to rollback uploaded avatar after DB error", {
          userId,
          storagePath: uploaded.storagePath,
          error: cleanupErr.message,
        });
      }
      throw dbError;
    }
  }

  /**
   * Remove a user's avatar from database and Supabase storage.
   */
  async removeAvatar(userId) {
    if (!userId) {
      throw createAvatarError(
        "User authentication required.",
        AUTH_AVATAR_CONSTANTS.ERROR_CODES.UNAUTHORIZED,
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw createAvatarError(
        "User account not found.",
        AUTH_AVATAR_CONSTANTS.ERROR_CODES.USER_NOT_FOUND,
        404
      );
    }

    const previousAvatarPath = user.avatarPath;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: null,
        avatarPath: null,
      },
    });

    if (typeof clearUserCache === "function") {
      clearUserCache(userId);
    }

    if (previousAvatarPath) {
      try {
        await deleteUserAvatar(previousAvatarPath);
      } catch (cleanupErr) {
        console.warn("Non-fatal: Failed to delete avatar file during removal", {
          userId,
          previousAvatarPath,
          error: cleanupErr.message,
        });
      }
    }

    return {
      user: AuthMapper.toUserResponse(updatedUser),
      avatarUrl: null,
      avatarPath: null,
      message: "Profile photo removed successfully.",
    };
  }
}

module.exports = new AuthAvatarService();

