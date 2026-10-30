"use strict";

const { createClient } = require("@supabase/supabase-js");

const getStorageClient = () => {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_COMPANY_LOGO_BUCKET,
  } = process.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SUPABASE_COMPANY_LOGO_BUCKET
  ) {
    const error = new Error(
      "Supabase storage is not configured for company assets"
    );
    error.code = "STORAGE_NOT_CONFIGURED";
    error.statusCode = 500;
    throw error;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { supabase, bucket: SUPABASE_COMPANY_LOGO_BUCKET };
};

const uploadCompanyFavicon = async ({ fileBuffer, contentType, storagePath }) => {
  const { supabase, bucket } = getStorageClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (error) {
    const uploadError = new Error("Failed to upload company favicon");
    uploadError.code = "FAVICON_UPLOAD_FAILED";
    uploadError.statusCode = 500;
    uploadError.cause = error;
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    const urlError = new Error("Failed to generate company favicon URL");
    urlError.code = "FAVICON_URL_GENERATION_FAILED";
    urlError.statusCode = 500;
    throw urlError;
  }

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
};

const deleteCompanyFavicon = async (storagePath) => {
  if (!storagePath) {
    return;
  }

  const { supabase, bucket } = getStorageClient();

  const { error } = await supabase.storage.from(bucket).remove([storagePath]);

  if (error) {
    const deleteError = new Error("Failed to delete company favicon");
    deleteError.code = "FAVICON_DELETE_FAILED";
    deleteError.statusCode = 500;
    deleteError.cause = error;
    throw deleteError;
  }
};

module.exports = {
  uploadCompanyFavicon,
  deleteCompanyFavicon,
};

