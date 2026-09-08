"use strict";

const companyLogoService = require("./company.logo.service");

const uploadLogo = async (req, res, next) => {
  try {
    const result = await companyLogoService.uploadLogo(
      req.companyId,
      req.companyMember.role,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "Company logo uploaded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadLogo,
};
