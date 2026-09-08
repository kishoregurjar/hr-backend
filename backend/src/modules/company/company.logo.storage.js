"use strict";

const { createClient } = require("@supabase/supabase-js");

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_COMPANY_LOGO_BUCKET,
} = process.env;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not configured");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
}

if (!SUPABASE_COMPANY_LOGO_BUCKET) {
  throw new Error("SUPABASE_COMPANY_LOGO_BUCKET is not configured");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const uploadCompanyLogo = async ({ fileBuffer, contentType, storagePath }) => {
  const { error } = await supabase.storage
    .from(SUPABASE_COMPANY_LOGO_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (error) {
    const uploadError = new Error("Failed to upload company logo");
    uploadError.code = "COMPANY_LOGO_UPLOAD_FAILED";
    uploadError.statusCode = 500;
    uploadError.cause = error;
    throw uploadError;
  }

  const { data } = supabase.storage
    .from(SUPABASE_COMPANY_LOGO_BUCKET)
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    const urlError = new Error("Failed to generate company logo URL");
    urlError.code = "COMPANY_LOGO_URL_GENERATION_FAILED";
    urlError.statusCode = 500;
    throw urlError;
  }

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
};

const deleteCompanyLogo = async (storagePath) => {
  if (!storagePath) {
    return;
  }

  const { error } = await supabase.storage
    .from(SUPABASE_COMPANY_LOGO_BUCKET)
    .remove([storagePath]);

  if (error) {
    const deleteError = new Error("Failed to delete company logo");
    deleteError.code = "COMPANY_LOGO_DELETE_FAILED";
    deleteError.statusCode = 500;
    deleteError.cause = error;
    throw deleteError;
  }
};

module.exports = {
  uploadCompanyLogo,
  deleteCompanyLogo,
};
