"use strict";

const { createClient } = require("@supabase/supabase-js");
const { AUTH_AVATAR_CONSTANTS } = require("./auth.avatar.constants");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const bucketName = process.env.SUPABASE_PROFILE_PHOTOS_BUCKET || AUTH_AVATAR_CONSTANTS.STORAGE_BUCKET;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not configured");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const uploadUserAvatar = async ({ fileBuffer, contentType, storagePath }) => {
  const normalizedPath = storagePath.startsWith(`${bucketName}/`)
    ? storagePath.slice(bucketName.length + 1)
    : storagePath;

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(normalizedPath, fileBuffer, {
      contentType: contentType || AUTH_AVATAR_CONSTANTS.OUTPUT_MIME_TYPE,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    const uploadError = new Error("Failed to upload avatar image to storage");
    uploadError.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.UPLOAD_FAILED;
    uploadError.statusCode = 500;
    uploadError.cause = error;
    throw uploadError;
  }

  const { data } = supabase.storage
    .from(bucketName)
    .getPublicUrl(normalizedPath);

  if (!data?.publicUrl) {
    const urlError = new Error("Failed to generate avatar public URL");
    urlError.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.URL_GENERATION_FAILED;
    urlError.statusCode = 500;
    throw urlError;
  }

  return {
    storagePath: normalizedPath,
    publicUrl: data.publicUrl,
  };
};

const deleteUserAvatar = async (storagePath) => {
  if (!storagePath) {
    return;
  }

  const normalizedPath = storagePath.startsWith(`${bucketName}/`)
    ? storagePath.slice(bucketName.length + 1)
    : storagePath;

  const { error } = await supabase.storage
    .from(bucketName)
    .remove([normalizedPath]);

  if (error) {
    const deleteError = new Error("Failed to delete avatar from storage");
    deleteError.code = AUTH_AVATAR_CONSTANTS.ERROR_CODES.DELETE_FAILED;
    deleteError.statusCode = 500;
    deleteError.cause = error;
    throw deleteError;
  }
};

module.exports = {
  uploadUserAvatar,
  deleteUserAvatar,
};
