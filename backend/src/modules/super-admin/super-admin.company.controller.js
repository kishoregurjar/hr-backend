"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const { createSuperAdminCompanySchema } = require("./super-admin.company.validator");
const superAdminCompanyService = require("./super-admin.company.service");
const { toCreateCompanyResponse } = require("./super-admin.company.dto");

class SuperAdminCompanyController {
  createCompany = asyncHandler(async (req, res) => {
    const validatedData = createSuperAdminCompanySchema.parse(req.body);

    const result = await superAdminCompanyService.createCompanyWithOwner(
      validatedData
    );

    return SuccessResponse.send(
      res,
      {
        message: "Company and initial owner created successfully",
        data: toCreateCompanyResponse(result),
      },
      StatusCodes.CREATED
    );
  });

  resendActivation = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const ownerActivationService = require("./super-admin.owner-activation.service");

    const result = await ownerActivationService.resendOwnerActivation({
      companyId,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Owner activation email has been queued.",
        data: {
          company: {
            id: result.company.id,
            name: result.company.name,
          },
          owner: {
            id: result.owner.id,
            email: result.owner.email,
            status: result.owner.status,
          },
          expiresAt: result.expiresAt,
        },
      },
      StatusCodes.ACCEPTED
    );
  });

  listCompanies = asyncHandler(async (req, res) => {
    const {
      listCompaniesSchema,
    } = require("./super-admin.company.validator");

    const query = listCompaniesSchema.parse(req.query);
    const result = await superAdminCompanyService.listCompanies(query);

    return SuccessResponse.send(
      res,
      {
        message: "Companies retrieved successfully",
        data: result,
      },
      StatusCodes.OK
    );
  });

  getCompany = asyncHandler(async (req, res) => {
    const {
      companyIdParamSchema,
    } = require("./super-admin.company.validator");

    const { companyId } = companyIdParamSchema.parse(req.params);
    const company = await superAdminCompanyService.getCompany(companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Company details retrieved successfully",
        data: { company },
      },
      StatusCodes.OK
    );
  });

  updateCompanyStatus = asyncHandler(async (req, res) => {
    const {
      companyIdParamSchema,
      updateCompanyStatusSchema,
    } = require("./super-admin.company.validator");

    const { companyId } = companyIdParamSchema.parse(req.params);
    const { status } = updateCompanyStatusSchema.parse(req.body);

    const company = await superAdminCompanyService.updateCompanyStatus(
      companyId,
      status
    );

    return SuccessResponse.send(
      res,
      {
        message: `Company status updated to ${status} successfully`,
        data: { company },
      },
      StatusCodes.OK
    );
  });
}

module.exports = new SuperAdminCompanyController();
