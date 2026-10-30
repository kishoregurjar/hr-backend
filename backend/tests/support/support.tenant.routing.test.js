"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const supportService = require("../../src/modules/support/support.service");
const supportRepository = require("../../src/modules/support/support.repository");
const { prisma } = require("../../src/config/prisma");
const emailUtil = require("../../src/utils/email");

describe("Support Ticket Multi-Tenant Routing & Isolation Suite", () => {
  // Saved original implementations for clean restoration
  let origFindRecentDuplicate;
  let origCreateSupportRequest;
  let origFindById;
  let origFindByUserId;
  let origFindByCompanyId;
  let origFindAll;
  let origSaveReply;
  let origUpdateStatus;
  let origFindCompanyActiveAdmins;
  let origFindCompanyMember;
  let origFindDefaultCompanyMemberForUser;
  let origUserFindUnique;
  let origSendEmail;

  // Track emails sent in tests
  let sentEmails = [];

  // Mock Tenants & Users
  const tenants = {
    facebook: {
      id: "comp_facebook",
      name: "Facebook Company",
      owner: {
        id: "user_fb_owner",
        email: "rohitpanchal722401@gmail.com",
        name: "Rohit Panchal",
        role: "HR",
      },
      recruiter: {
        id: "user_fb_recruiter",
        email: "sr230757@gmail.com",
        name: "Shivam Solanki",
        role: "HR",
      },
    },
    oracle: {
      id: "comp_oracle",
      name: "Oracle",
      owner: {
        id: "user_oracle_owner",
        email: "oracle_owner@oracle.com",
        name: "Larry Ellison",
        role: "HR",
      },
      recruiter: {
        id: "user_oracle_recruiter",
        email: "oracle_hr@oracle.com",
        name: "Oracle Recruiter",
        role: "HR",
      },
    },
    microsoft: {
      id: "comp_microsoft",
      name: "Microsoft IT Company",
      owner: {
        id: "user_ms_owner",
        email: "ms_owner@microsoft.com",
        name: "Satya Nadella",
        role: "HR",
      },
      recruiter: {
        id: "user_ms_recruiter",
        email: "ms_hr@microsoft.com",
        name: "MS Recruiter",
        role: "HR",
      },
    },
    superAdmin: {
      id: "user_super_admin",
      email: "admin@hirequest.com",
      name: "Platform Super Admin",
      role: "SUPER_ADMIN",
    },
  };

  // In-memory support requests database for tests
  let dbRequests = [];
  let requestCounter = 1;

  beforeEach(() => {
    sentEmails = [];
    dbRequests = [];
    requestCounter = 1;

    // Stash original methods
    origFindRecentDuplicate = supportRepository.findRecentDuplicate;
    origCreateSupportRequest = supportRepository.createSupportRequest;
    origFindById = supportRepository.findById;
    origFindByUserId = supportRepository.findByUserId;
    origFindByCompanyId = supportRepository.findByCompanyId;
    origFindAll = supportRepository.findAll;
    origSaveReply = supportRepository.saveReply;
    origUpdateStatus = supportRepository.updateStatus;
    origFindCompanyActiveAdmins = supportRepository.findCompanyActiveAdmins;
    origFindCompanyMember = supportRepository.findCompanyMember;
    origFindDefaultCompanyMemberForUser = supportRepository.findDefaultCompanyMemberForUser;
    origUserFindUnique = prisma.user.findUnique;
    origSendEmail = emailUtil.sendEmail;

    // Mock sendEmail to capture calls
    emailUtil.sendEmail = async (params) => {
      sentEmails.push(params);
      return { messageId: "mock_msg_id", accepted: [params.to] };
    };

    // Mock duplicate check (allow all by default)
    supportRepository.findRecentDuplicate = async () => null;

    // Mock createSupportRequest
    supportRepository.createSupportRequest = async (data) => {
      const newReq = {
        id: `req_${requestCounter++}`,
        userId: data.userId,
        companyId: data.companyId || null,
        subject: data.subject,
        message: data.message,
        status: data.status || "OPEN",
        adminReply: null,
        repliedById: null,
        repliedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: data.userId,
          name: "Test Submitter",
          email: "submitter@example.com",
        },
        company: data.companyId
          ? {
              id: data.companyId,
              name:
                data.companyId === "comp_facebook"
                  ? "Facebook Company"
                  : data.companyId === "comp_oracle"
                  ? "Oracle"
                  : "Microsoft IT Company",
            }
          : null,
      };
      dbRequests.push(newReq);
      return newReq;
    };

    // Mock findById
    supportRepository.findById = async (id) => {
      const found = dbRequests.find((r) => r.id === id);
      return found ? { ...found } : null;
    };

    // Mock findByUserId
    supportRepository.findByUserId = async ({ userId }) => {
      const items = dbRequests.filter((r) => r.userId === userId);
      return { items, total: items.length, page: 1, limit: 20, totalPages: 1 };
    };

    // Mock findByCompanyId
    supportRepository.findByCompanyId = async ({ companyId }) => {
      const items = dbRequests.filter((r) => r.companyId === companyId);
      return { items, total: items.length, page: 1, limit: 20, totalPages: 1 };
    };

    // Mock findAll (strictly platform-level requests: companyId === null)
    supportRepository.findAll = async () => {
      const items = dbRequests.filter((r) => r.companyId === null);
      return { items, total: items.length, page: 1, limit: 20, totalPages: 1 };
    };

    // Mock updateStatus
    supportRepository.updateStatus = async (id, status) => {
      const req = dbRequests.find((r) => r.id === id);
      if (!req) return null;
      req.status = status;
      req.updatedAt = new Date();
      return { ...req };
    };

    // Mock saveReply
    supportRepository.saveReply = async (id, { adminReply, repliedById, status }) => {
      const req = dbRequests.find((r) => r.id === id);
      if (!req) return null;
      req.adminReply = adminReply;
      req.repliedById = repliedById;
      req.repliedAt = new Date();
      req.status = status || "RESOLVED";
      return { ...req };
    };

    // Mock user lookup
    prisma.user.findUnique = async ({ where }) => {
      for (const t of [tenants.facebook, tenants.oracle, tenants.microsoft]) {
        if (t.owner.id === where.id) return t.owner;
        if (t.recruiter.id === where.id) return t.recruiter;
      }
      if (where.id === tenants.superAdmin.id) return tenants.superAdmin;
      return null;
    };

    // Mock company member lookup (strictly enforces tenant boundaries)
    supportRepository.findCompanyMember = async (companyId, userId) => {
      const tenantKey = Object.keys(tenants).find((k) => tenants[k]?.id === companyId);
      if (!tenantKey) return null;
      const tenant = tenants[tenantKey];

      if (tenant.owner.id === userId) {
        return {
          id: `mem_${companyId}_owner`,
          companyId,
          userId,
          role: "OWNER",
          company: { id: companyId, name: tenant.name },
          user: tenant.owner,
        };
      }
      if (tenant.recruiter.id === userId) {
        return {
          id: `mem_${companyId}_recruiter`,
          companyId,
          userId,
          role: "RECRUITER",
          company: { id: companyId, name: tenant.name },
          user: tenant.recruiter,
        };
      }
      return null;
    };

    // Mock default company member lookup
    supportRepository.findDefaultCompanyMemberForUser = async (userId) => {
      for (const t of [tenants.facebook, tenants.oracle, tenants.microsoft]) {
        if (t.owner.id === userId) {
          return {
            id: `mem_${t.id}_owner`,
            companyId: t.id,
            userId,
            role: "OWNER",
            company: { id: t.id, name: t.name },
            user: t.owner,
          };
        }
        if (t.recruiter.id === userId) {
          return {
            id: `mem_${t.id}_recruiter`,
            companyId: t.id,
            userId,
            role: "RECRUITER",
            company: { id: t.id, name: t.name },
            user: t.recruiter,
          };
        }
      }
      return null;
    };

    // Mock active admins query for a company
    supportRepository.findCompanyActiveAdmins = async (companyId) => {
      const tenantKey = Object.keys(tenants).find((k) => tenants[k]?.id === companyId);
      if (!tenantKey) return [];
      const tenant = tenants[tenantKey];
      return [
        {
          id: `mem_${companyId}_owner`,
          companyId,
          userId: tenant.owner.id,
          role: "OWNER",
          user: {
            id: tenant.owner.id,
            email: tenant.owner.email,
            name: tenant.owner.name,
            status: "ACTIVE",
          },
        },
      ];
    };
  });

  afterEach(() => {
    // Restore all mocked methods
    supportRepository.findRecentDuplicate = origFindRecentDuplicate;
    supportRepository.createSupportRequest = origCreateSupportRequest;
    supportRepository.findById = origFindById;
    supportRepository.findByUserId = origFindByUserId;
    supportRepository.findByCompanyId = origFindByCompanyId;
    supportRepository.findAll = origFindAll;
    supportRepository.saveReply = origSaveReply;
    supportRepository.updateStatus = origUpdateStatus;
    supportRepository.findCompanyActiveAdmins = origFindCompanyActiveAdmins;
    supportRepository.findCompanyMember = origFindCompanyMember;
    supportRepository.findDefaultCompanyMemberForUser = origFindDefaultCompanyMemberForUser;
    prisma.user.findUnique = origUserFindUnique;
    emailUtil.sendEmail = origSendEmail;
  });

  // ─── Test 1: Facebook Company Tickets ───────────────────────────────────────
  it("Facebook Company tickets reach only its Owner/Admin and not Super Admin or other tenants", async () => {
    const res = await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: tenants.facebook.id,
      subject: "Facebook Candidate Issue",
      message: "Need help reviewing candidates for Facebook engineering roles.",
    });

    assert.ok(res.id);
    assert.strictEqual(res.companyId, "comp_facebook");

    // Exactly 1 email notification was sent
    assert.strictEqual(sentEmails.length, 1);
    const sent = sentEmails[0];

    // Notification reached Facebook Owner
    assert.ok(sent.to.includes("rohitpanchal722401@gmail.com"));

    // Notification did NOT reach Super Admin
    assert.ok(!sent.to.includes("admin@hirequest.com"));

    // Notification did NOT reach Oracle or Microsoft
    assert.ok(!sent.to.includes("oracle_owner@oracle.com"));
    assert.ok(!sent.to.includes("ms_owner@microsoft.com"));
  });

  // ─── Test 2: Oracle Tickets ────────────────────────────────────────────────
  it("Oracle tickets reach only Oracle's Owner/Admin and not Facebook, Microsoft or Super Admin", async () => {
    const res = await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      requestedCompanyId: tenants.oracle.id,
      subject: "Oracle Database Integration Issue",
      message: "Encountered a problem during assessment question bank setup.",
    });

    assert.ok(res.id);
    assert.strictEqual(res.companyId, "comp_oracle");

    assert.strictEqual(sentEmails.length, 1);
    const sent = sentEmails[0];

    // Reached Oracle Owner only
    assert.ok(sent.to.includes("oracle_owner@oracle.com"));
    assert.ok(!sent.to.includes("rohitpanchal722401@gmail.com"));
    assert.ok(!sent.to.includes("ms_owner@microsoft.com"));
    assert.ok(!sent.to.includes("admin@hirequest.com"));
  });

  // ─── Test 3: Microsoft Tickets ─────────────────────────────────────────────
  it("Microsoft tickets reach only Microsoft's Owner/Admin and not Facebook, Oracle or Super Admin", async () => {
    const res = await supportService.submitRequest({
      userId: tenants.microsoft.recruiter.id,
      requestedCompanyId: tenants.microsoft.id,
      subject: "Microsoft Candidate Attempt Reset",
      message: "Please reset attempt token for assessment 4 candidate.",
    });

    assert.ok(res.id);
    assert.strictEqual(res.companyId, "comp_microsoft");

    assert.strictEqual(sentEmails.length, 1);
    const sent = sentEmails[0];

    // Reached Microsoft Owner only
    assert.ok(sent.to.includes("ms_owner@microsoft.com"));
    assert.ok(!sent.to.includes("rohitpanchal722401@gmail.com"));
    assert.ok(!sent.to.includes("oracle_owner@oracle.com"));
    assert.ok(!sent.to.includes("admin@hirequest.com"));
  });

  // ─── Test 4: Super Admin Does Not Receive Tenant Tickets by Default ────────
  it("The Platform Super Admin does not receive ordinary tenant support tickets by default", async () => {
    // Submit from all 3 tenants
    await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      subject: "Ticket 1",
      message: "Details for ticket 1",
    });
    await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      subject: "Ticket 2",
      message: "Details for ticket 2",
    });
    await supportService.submitRequest({
      userId: tenants.microsoft.recruiter.id,
      subject: "Ticket 3",
      message: "Details for ticket 3",
    });

    assert.strictEqual(sentEmails.length, 3);
    for (const email of sentEmails) {
      assert.ok(
        !email.to.includes("admin@hirequest.com"),
        `Expected admin@hirequest.com not in ${email.to}`
      );
    }
  });

  // ─── Test 5: Prevent Submitting on Behalf of Another Tenant ─────────────────
  it("A user cannot submit a ticket on behalf of another tenant by changing a request field", async () => {
    // Facebook recruiter maliciously specifies Oracle's company ID
    await assert.rejects(
      async () => {
        await supportService.submitRequest({
          userId: tenants.facebook.recruiter.id,
          requestedCompanyId: "comp_oracle",
          subject: "Spoofed Ticket Attempt",
          message: "Trying to submit under Oracle tenant ID.",
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );

    // No ticket was created for Oracle
    assert.strictEqual(dbRequests.length, 0);
    assert.strictEqual(sentEmails.length, 0);
  });

  // ─── Test 6: Cross-Tenant Ticket Visibility Isolation ───────────────────────
  it("Users and admins cannot view another company's support tickets", async () => {
    // Create an Oracle ticket
    const oracleTicket = await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      requestedCompanyId: "comp_oracle",
      subject: "Oracle Confidential Request",
      message: "Internal inquiry for Oracle owner.",
    });

    // 1. Facebook Owner cannot view Oracle's ticket
    await assert.rejects(
      async () => {
        await supportService.getRequest(oracleTicket.id, tenants.facebook.owner);
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        return true;
      }
    );

    // 2. Facebook Owner cannot list Oracle's tickets
    await assert.rejects(
      async () => {
        await supportService.listCompanyRequests({
          user: tenants.facebook.owner,
          requestedCompanyId: "comp_oracle",
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        return true;
      }
    );

    // 3. Facebook Recruiter cannot view Oracle's ticket
    await assert.rejects(
      async () => {
        await supportService.getRequest(oracleTicket.id, tenants.facebook.recruiter);
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        return true;
      }
    );

    // 4. Oracle Owner CAN view Oracle's ticket
    const viewedByOracleOwner = await supportService.getRequest(
      oracleTicket.id,
      tenants.oracle.owner
    );
    assert.strictEqual(viewedByOracleOwner.id, oracleTicket.id);

    // 5. Oracle Recruiter (the submitter) CAN view their own ticket
    const viewedBySubmitter = await supportService.getRequest(
      oracleTicket.id,
      tenants.oracle.recruiter
    );
    assert.strictEqual(viewedBySubmitter.id, oracleTicket.id);
  });

  // ─── Test 7: Submitter Retains Access to Recent Tickets & Replies ──────────
  it("The submitter can still see their own recent tickets and replies", async () => {
    // Submitter creates a ticket
    const ticket = await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "Login query",
      message: "Cannot access team management tab.",
    });

    // Company Owner replies to the ticket
    await supportService.replyToRequest(ticket.id, {
      reply: "Team tab is restricted to Company Owner role.",
      user: tenants.facebook.owner,
    });

    // Submitter views their own recent requests
    const myRequests = await supportService.listMyRequests({
      userId: tenants.facebook.recruiter.id,
    });
    assert.strictEqual(myRequests.items.length, 1);
    assert.strictEqual(myRequests.items[0].id, ticket.id);
    assert.strictEqual(myRequests.items[0].status, "RESOLVED");
    assert.strictEqual(
      myRequests.items[0].adminReply,
      "Team tab is restricted to Company Owner role."
    );

    // Submitter views single ticket detail
    const detail = await supportService.getRequest(ticket.id, tenants.facebook.recruiter);
    assert.strictEqual(detail.id, ticket.id);
    assert.strictEqual(detail.adminReply, "Team tab is restricted to Company Owner role.");
    assert.strictEqual(detail.status, "RESOLVED");
  });

  // ─── Test 8: Company Owner Ticket Listing & Cross-Tenant Isolation ─────────
  it("Facebook, Oracle, and Microsoft Owners can each view only their own company tickets", async () => {
    // 1. Submit ticket in Facebook
    await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "FB Ticket",
      message: "Facebook team issue",
    });

    // 2. Submit ticket in Oracle
    await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      requestedCompanyId: "comp_oracle",
      subject: "Oracle Ticket",
      message: "Oracle team issue",
    });

    // 3. Submit ticket in Microsoft
    await supportService.submitRequest({
      userId: tenants.microsoft.recruiter.id,
      requestedCompanyId: "comp_microsoft",
      subject: "MS Ticket",
      message: "Microsoft team issue",
    });

    // Verify Facebook Owner views ONLY Facebook tickets
    const fbList = await supportService.listCompanyRequests({
      user: tenants.facebook.owner,
    });
    assert.strictEqual(fbList.items.length, 1);
    assert.strictEqual(fbList.items[0].subject, "FB Ticket");
    assert.strictEqual(fbList.items[0].companyId, "comp_facebook");

    // Verify Oracle Owner views ONLY Oracle tickets
    const oracleList = await supportService.listCompanyRequests({
      user: tenants.oracle.owner,
    });
    assert.strictEqual(oracleList.items.length, 1);
    assert.strictEqual(oracleList.items[0].subject, "Oracle Ticket");
    assert.strictEqual(oracleList.items[0].companyId, "comp_oracle");

    // Verify Microsoft Owner views ONLY Microsoft tickets
    const msList = await supportService.listCompanyRequests({
      user: tenants.microsoft.owner,
    });
    assert.strictEqual(msList.items.length, 1);
    assert.strictEqual(msList.items[0].subject, "MS Ticket");
    assert.strictEqual(msList.items[0].companyId, "comp_microsoft");
  });

  // ─── Test 9: Recruiter Cannot Access Management Page / Endpoint ───────────
  it("Recruiters cannot access the company support ticket management endpoint", async () => {
    await assert.rejects(
      async () => {
        await supportService.listCompanyRequests({
          user: tenants.facebook.recruiter,
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await supportService.listCompanyRequests({
          user: tenants.oracle.recruiter,
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        return true;
      }
    );
  });

  // ─── Test 10: Owner Status Update & Reply Reflects in HR View ──────────────
  it("Owner status update and reply seamlessly reflect in the submitter's ticket history", async () => {
    // HR Submits ticket
    const ticket = await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "Need candidate export",
      message: "Please enable candidate CSV export for recruiter role.",
    });

    // 1. Owner updates status to IN_PROGRESS
    await supportService.updateRequestStatus(
      ticket.id,
      "IN_PROGRESS",
      tenants.facebook.owner
    );

    // HR verifies status changed to IN_PROGRESS
    let hrRequests = await supportService.listMyRequests({
      userId: tenants.facebook.recruiter.id,
    });
    assert.strictEqual(hrRequests.items[0].status, "IN_PROGRESS");
    assert.strictEqual(hrRequests.items[0].adminReply, null);

    // 2. Owner replies to the ticket
    await supportService.replyToRequest(ticket.id, {
      reply: "CSV export has been granted to your account.",
      user: tenants.facebook.owner,
    });

    // HR verifies status changed to RESOLVED with the admin reply
    hrRequests = await supportService.listMyRequests({
      userId: tenants.facebook.recruiter.id,
    });
    assert.strictEqual(hrRequests.items[0].status, "RESOLVED");
    assert.strictEqual(
      hrRequests.items[0].adminReply,
      "CSV export has been granted to your account."
    );
  });

  // ─── Test 11: Tenant Tickets Invisible to Platform Super Admin Inbox ───────
  it("Facebook, Oracle, and Microsoft tenant tickets are completely invisible to Platform Super Admin", async () => {
    // Submit tenant tickets
    await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "Facebook Private Inquiry",
      message: "Internal questions for Facebook owner.",
    });

    await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      requestedCompanyId: "comp_oracle",
      subject: "Oracle Private Inquiry",
      message: "Internal questions for Oracle owner.",
    });

    await supportService.submitRequest({
      userId: tenants.microsoft.recruiter.id,
      requestedCompanyId: "comp_microsoft",
      subject: "Microsoft Private Inquiry",
      message: "Internal questions for Microsoft owner.",
    });

    // Create a genuine platform-level ticket (companyId: null)
    await supportRepository.createSupportRequest({
      userId: tenants.superAdmin.id,
      companyId: null,
      subject: "Platform Infrastructure Maintenance",
      message: "Direct platform query without company.",
      status: "OPEN",
    });

    // Super Admin lists all support requests
    const adminInbox = await supportService.listAllRequests({});

    // Super Admin should see ONLY the platform-level ticket (1 total)
    assert.strictEqual(adminInbox.items.length, 1);
    assert.strictEqual(adminInbox.items[0].subject, "Platform Infrastructure Maintenance");
    assert.strictEqual(adminInbox.items[0].companyId, null);

    // Verify none of the tenant tickets are in the Super Admin inbox
    const tenantSubjects = adminInbox.items.map((i) => i.subject);
    assert.ok(!tenantSubjects.includes("Facebook Private Inquiry"));
    assert.ok(!tenantSubjects.includes("Oracle Private Inquiry"));
    assert.ok(!tenantSubjects.includes("Microsoft Private Inquiry"));
  });

  // ─── Test 12: Super Admin Cannot Access Tenant Ticket Directly by ID ──────
  it("Platform Super Admin cannot access a tenant ticket directly by ID", async () => {
    const fbTicket = await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "Confidential Facebook Ticket",
      message: "Details confidential to Facebook only.",
    });

    const oracleTicket = await supportService.submitRequest({
      userId: tenants.oracle.recruiter.id,
      requestedCompanyId: "comp_oracle",
      subject: "Confidential Oracle Ticket",
      message: "Details confidential to Oracle only.",
    });

    // Super Admin attempts to view Facebook ticket directly by ID
    await assert.rejects(
      async () => {
        await supportService.getRequest(fbTicket.id, tenants.superAdmin);
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );

    // Super Admin attempts to view Oracle ticket directly by ID
    await assert.rejects(
      async () => {
        await supportService.getRequest(oracleTicket.id, tenants.superAdmin);
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );
  });

  // ─── Test 13: Super Admin Cannot Update or Reply to a Tenant Ticket ────────
  it("Platform Super Admin cannot update status or reply to a tenant ticket", async () => {
    const fbTicket = await supportService.submitRequest({
      userId: tenants.facebook.recruiter.id,
      requestedCompanyId: "comp_facebook",
      subject: "Facebook Ticket for Owner",
      message: "Question meant for Facebook admin.",
    });

    // Super Admin attempts to change status of Facebook ticket
    await assert.rejects(
      async () => {
        await supportService.updateRequestStatus(
          fbTicket.id,
          "RESOLVED",
          tenants.superAdmin
        );
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );

    // Super Admin attempts to reply to Facebook ticket
    await assert.rejects(
      async () => {
        await supportService.replyToRequest(fbTicket.id, {
          reply: "Platform Admin trying to reply.",
          user: tenants.superAdmin,
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode || err.status, 403);
        assert.strictEqual(err.code, "SUPPORT_ACCESS_DENIED");
        return true;
      }
    );
  });

  // ─── Test 14: Platform-Level Tickets Remain Accessible to Super Admin ──────
  it("Genuine platform-level tickets remain fully accessible to Platform Super Admin", async () => {
    // Create a platform-level ticket (companyId: null)
    const platformTicket = await supportRepository.createSupportRequest({
      userId: tenants.superAdmin.id,
      companyId: null,
      subject: "Platform Level Issue",
      message: "System health check query.",
      status: "OPEN",
    });

    // Super Admin views platform ticket
    const viewed = await supportService.getRequest(
      platformTicket.id,
      tenants.superAdmin
    );
    assert.strictEqual(viewed.id, platformTicket.id);
    assert.strictEqual(viewed.companyId, null);

    // Super Admin updates status
    const updated = await supportService.updateRequestStatus(
      platformTicket.id,
      "IN_PROGRESS",
      tenants.superAdmin
    );
    assert.strictEqual(updated.status, "IN_PROGRESS");

    // Super Admin replies to platform ticket
    const replied = await supportService.replyToRequest(platformTicket.id, {
      reply: "Platform issue has been resolved.",
      user: tenants.superAdmin,
    });
    assert.strictEqual(replied.status, "RESOLVED");
    assert.strictEqual(replied.adminReply, "Platform issue has been resolved.");
  });
});

