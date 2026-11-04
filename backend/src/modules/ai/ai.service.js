const { GoogleGenerativeAI } = require("@google/generative-ai");
const { prisma } = require("../../config/prisma");

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.client = null;
    if (this.apiKey) {
      try {
        this.client = new GoogleGenerativeAI(this.apiKey);
      } catch (err) {
        console.warn("Failed to initialize GoogleGenerativeAI client:", err.message);
      }
    }
  }

  getApiKey() {
    return process.env.GEMINI_API_KEY || this.apiKey || "";
  }

  getClient() {
    const key = this.getApiKey();
    if (!key) return null;
    return new GoogleGenerativeAI(key);
  }

  /**
   * Fetch company hiring context to ground the LLM in real data
   */
  async getCompanyHiringContext(user) {
    try {
      let companyName = "HireQuest Organization";
      let companyId = null;

      if (user?.id) {
        const member = await prisma.companyMember.findFirst({
          where: { userId: user.id },
          include: { company: true },
        });
        if (member?.company) {
          companyName = member.company.name;
          companyId = member.companyId;
        }
      }

      // 1. Question Bank Stats (Total questions & difficulty distribution)
      const [totalQuestions, questionBreakdown, sampleQuestions] = await Promise.all([
        prisma.question.count().catch(() => 0),
        prisma.question.groupBy({
          by: ["difficulty"],
          _count: { id: true },
        }).catch(() => []),
        prisma.question.findMany({
          select: { title: true, difficulty: true, type: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        }).catch(() => []),
      ]);

      const difficultyCounts = {
        EASY: 0,
        MEDIUM: 0,
        HARD: 0,
      };
      if (Array.isArray(questionBreakdown)) {
        for (const item of questionBreakdown) {
          if (item.difficulty && difficultyCounts[item.difficulty] !== undefined) {
            difficultyCounts[item.difficulty] = item._count.id;
          }
        }
      }

      // 2. Recent Assessments
      const assessments = await prisma.assessment.findMany({
        where: companyId
          ? {
              createdBy: {
                companyMembers: { some: { companyId } },
              },
            }
          : {},
        select: {
          id: true,
          title: true,
          status: true,
          durationMinutes: true,
          passingScore: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }).catch(() => []);

      // 3. Top candidate submissions
      const topAttempts = await prisma.candidateAttempt.findMany({
        where: {
          status: "SUBMITTED",
        },
        select: {
          id: true,
          percentage: true,
          score: true,
          result: true,
          submittedAt: true,
          candidate: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
          assessment: {
            select: {
              title: true,
            },
          },
        },
        orderBy: { percentage: "desc" },
        take: 8,
      }).catch(() => []);

      // 4. Candidate Pool & Invitations with Daily and Source breakdown
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        totalCandidates,
        todayCandidatesCount,
        totalInvitations,
        totalAttempts,
        passedAttempts,
        failedAttempts,
        inProgressAttempts,
        recentCandidates,
        candidatesWithSource,
      ] = await Promise.all([
        prisma.candidateProfile.count({
          where: companyId ? { companyId } : {},
        }).catch(() => 0),
        prisma.candidateProfile.count({
          where: {
            ...(companyId ? { companyId } : {}),
            createdAt: { gte: startOfToday },
          },
        }).catch(() => 0),
        prisma.invitation.count({
          where: companyId ? { companyId } : {},
        }).catch(() => 0),
        prisma.candidateAttempt.count({
          where: {
            status: "SUBMITTED",
            ...(companyId ? { companyId } : {}),
          },
        }).catch(() => 0),
        prisma.candidateAttempt.count({
          where: {
            status: "SUBMITTED",
            result: "PASS",
            ...(companyId ? { companyId } : {}),
          },
        }).catch(() => 0),
        prisma.candidateAttempt.count({
          where: {
            status: "SUBMITTED",
            result: "FAIL",
            ...(companyId ? { companyId } : {}),
          },
        }).catch(() => 0),
        prisma.candidateAttempt.count({
          where: {
            status: { in: ["STARTED", "NOT_STARTED"] },
            ...(companyId ? { companyId } : {}),
          },
        }).catch(() => 0),
        prisma.candidateProfile.findMany({
          where: companyId ? { companyId } : {},
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        }).catch(() => []),
        prisma.candidateProfile.findMany({
          where: companyId ? { companyId } : {},
          select: {
            id: true,
            metadata: true,
          },
        }).catch(() => []),
      ]);

      let emailSourceCount = 0;
      let manualSourceCount = 0;
      candidatesWithSource.forEach((c) => {
        const src = String(c.metadata?.source || "").toUpperCase();
        if (src.includes("EMAIL") || c.metadata?.inbound) {
          emailSourceCount++;
        } else {
          manualSourceCount++;
        }
      });

      return {
        companyName,
        totalQuestions,
        difficultyCounts,
        sampleQuestions,
        totalCandidates,
        todayCandidatesCount,
        emailSourceCount,
        manualSourceCount,
        recentCandidates,
        totalInvitations,
        totalAttempts,
        passedAttempts,
        failedAttempts,
        inProgressAttempts,
        assessments,
        topAttempts,
      };
    } catch (err) {
      console.warn("Error fetching company context for AI Copilot:", err.message);
      return {
        companyName: "HireQuest Organization",
        totalQuestions: 0,
        difficultyCounts: { EASY: 0, MEDIUM: 0, HARD: 0 },
        sampleQuestions: [],
        totalCandidates: 0,
        todayCandidatesCount: 0,
        emailSourceCount: 0,
        manualSourceCount: 0,
        recentCandidates: [],
        totalInvitations: 0,
        totalAttempts: 0,
        passedAttempts: 0,
        failedAttempts: 0,
        inProgressAttempts: 0,
        assessments: [],
        topAttempts: [],
      };
    }
  }

  /**
   * Process Chat Message with Gemini or Grounded Intelligence Engine
   */
  async processHRCopilotChat({ message, history = [], user }) {
    if (!message || typeof message !== "string") {
      throw new Error("Message text is required.");
    }

    const context = await this.getCompanyHiringContext(user);
    const client = this.getClient();

    // Construct grounded system prompt with live DB context & Platform SOP Knowledge
    const assessmentsListStr = context.assessments.length > 0
      ? context.assessments.map((a) => `• "${a.title}" (Passing: ${a.passingScore}%, Duration: ${a.durationMinutes}m, Status: ${a.status})`).join("\n")
      : "No assessments created yet.";

    const topCandidatesStr = context.topAttempts.length > 0
      ? context.topAttempts.map((a) => {
          const name = `${a.candidate?.firstName || ""} ${a.candidate?.lastName || ""}`.trim() || a.candidate?.email || "Candidate";
          return `• ${name} (${a.candidate?.email || "N/A"}) - Score: ${Math.round(a.percentage || 0)}% in "${a.assessment?.title || "Assessment"}" [${a.result || "QUALIFIED"}]`;
        }).join("\n")
      : "No candidate test submissions recorded yet.";

    const questionsSummary = `Total Questions: ${context.totalQuestions} (Easy: ${context.difficultyCounts.EASY}, Medium: ${context.difficultyCounts.MEDIUM}, Hard: ${context.difficultyCounts.HARD})`;

    const systemPrompt = `You are "HireQuest HR Copilot", an elite AI recruitment & talent assessment assistant embedded in the HireQuest SaaS platform.
You are assisting HR Manager / Owner: ${user?.name || user?.fullName || user?.email || "HR Manager"}.
Company: ${context.companyName}.

LIVE DATABASE CONTEXT:
- Question Bank: ${questionsSummary}
- Total Candidates in Pool: ${context.totalCandidates} (Added Today: ${context.todayCandidatesCount})
- Candidate Acquisition Sources: Email Extraction: ${context.emailSourceCount}, Manual / Direct: ${context.manualSourceCount}
- Total Invitations Dispatched: ${context.totalInvitations}
- Test Attempts Summary: Total Submitted: ${context.totalAttempts}, Passed (Qualified): ${context.passedAttempts}, Failed: ${context.failedAttempts}, In-Progress: ${context.inProgressAttempts}
- Available Assessments:
${assessmentsListStr}

- Recent Top Performers & Test Results:
${topCandidatesStr}

HIREQUEST PLATFORM WORKFLOW KNOWLEDGE:
1. CREATE ASSESSMENT: Go to /assessments -> Click [+ Create Assessment](/assessments/create) -> Enter Title, Duration, Passing Score -> Select MCQs & Cognitive Games -> Click Publish.
2. EXTRACT RESUMES FROM EMAILS: Go to /candidates -> Connect Gmail in Recruiter Mailbox -> Click "Sync Mailbox" -> Click "Extract from Emails" -> AI parses resumes into candidate profiles.
3. SEND INVITATION / TEST LINK: Go to /invitations -> Click "+ Invite Candidate" -> Enter Email & select Assessment -> Magic test link is emailed directly to candidate.
4. VIEW RESULTS & PROCTORING: Go to /results -> View Leaderboard, qualification status, face recognition logs, tab switch counts.
5. QUESTION BANK: Go to /question-bank -> Filter by difficulty (Easy, Medium, Hard) -> Click "+ Add Question" to add new questions.
6. COGNITIVE GAMES: 4 gamified problem-solving modules (Focus, Memory, Logic) evaluating cognitive speed.

CAPABILITIES & PERSONALITY:
1. Provide concise, step-by-step, actionable answers to HR with clickable links (e.g. [Create Assessment](/assessments/create)).
2. Understand user questions in English, Hindi, or Hinglish, including common typos (like "assemsent", "kese banaye", "kaise kare").
3. Use clean markdown formatting with bold text, bullet points, and numbered steps.`;

    // 1. Try Gemini API first if client is configured
    if (client) {
      const candidateModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-1.5-flash"];
      for (const modelName of candidateModels) {
        try {
          const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt,
          });

          const contents = [];
          if (Array.isArray(history)) {
            for (const item of history.slice(-6)) {
              const role = item.role === "user" ? "user" : "model";
              const text = item.text || item.content || item.message || "";
              if (text) {
                contents.push({ role, parts: [{ text }] });
              }
            }
          }

          contents.push({
            role: "user",
            parts: [{ text: message }],
          });

          const result = await model.generateContent({ contents });
          const responseText = result.response.text();

          if (responseText && responseText.trim()) {
            return {
              reply: responseText,
              model: modelName,
              poweredBy: "Google Gemini AI",
            };
          }
        } catch (geminiError) {
          // Model error or rate limit, fall through to next model or rule engine
        }
      }
    }

    // 2. High-Precision Grounded Rule Engine (Grounded in Real-time DB & Platform SOPs)
    const lower = message.toLowerCase();
    const isHindi = /\b(kese|kaise|kare|karein|karna|krna|btao|batao|bana|banao|bhejo|bhejna|bheju|kru|karo|sawal|prashn|dekhein|hai|hain|kya|kyun|muje|mujhe|hum|hume|naya|aasan|jodein|par|me|kitne|chahiye|dikhao)\b/i.test(message);

    // ── Analytics 1: Candidates Added Today (Daily Intake) ──
    if (
      (lower.includes("aaj") || lower.includes("today")) &&
      (lower.includes("candidate") || lower.includes("candidates") || lower.includes("new") || lower.includes("aaye") || lower.includes("added"))
    ) {
      if (!isHindi) {
        return {
          reply: `**Today's Candidate Intake Summary:**\n\n` +
            `• 🆕 **Added Today:** **${context.todayCandidatesCount} new candidate(s)**\n` +
            `• 👥 **Total Candidate Pool:** ${context.totalCandidates} candidates\n` +
            `• 📧 **Email Extraction:** ${context.emailSourceCount} candidates\n` +
            `• ✍️ **Manual / Direct:** ${context.manualSourceCount} candidates\n\n` +
            `👉 **Direct Link:** [View Candidate Pipeline](/candidates)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `**Aaj ke Candidate Ingestion ka Live Status:**\n\n` +
          `• 🆕 **Aaj New Aaye:** **${context.todayCandidatesCount} new candidate(s)**\n` +
          `• 👥 **Total Candidate Pool:** ${context.totalCandidates} candidates\n` +
          `• 📧 **Email Extraction (Mailbox Sync):** ${context.emailSourceCount} candidates\n` +
          `• ✍️ **Manual Entry / Direct Upload:** ${context.manualSourceCount} candidates\n\n` +
          `👉 **Direct Link:** [Live Candidates List Dekhein](/candidates)`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Analytics 2: Candidates by Source (Email Extraction vs Manual) ──
    if (
      lower.includes("manual") ||
      (lower.includes("source") && (lower.includes("candidate") || lower.includes("candidates"))) ||
      (lower.includes("email") && (lower.includes("kitne") || lower.includes("kitn") || lower.includes("how many") || lower.includes("source")))
    ) {
      if (!isHindi) {
        return {
          reply: `**Candidate Pool Source Breakdown:**\n\n` +
            `• 📧 **Email Ingestion (Mailbox Sync):** **${context.emailSourceCount} candidates**\n` +
            `• ✍️ **Manual Entry / Direct Upload:** **${context.manualSourceCount} candidates**\n` +
            `• 👥 **Total Candidate Pool:** ${context.totalCandidates} candidates\n\n` +
            `You can sync your inbox and extract new candidate CVs on the [Candidates](/candidates) page.`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `**Candidates Source Breakdown (Email vs Manual):**\n\n` +
          `• 📧 **Email Extraction (Mailbox Sync):** **${context.emailSourceCount} candidates**\n` +
          `• ✍️ **Manual Entry / Direct Upload:** **${context.manualSourceCount} candidates**\n` +
          `• 👥 **Total Candidate Pool:** ${context.totalCandidates} candidates\n\n` +
          `Naye resumes email se extract karne ke liye aap [Candidates](/candidates) page par ja sakte hain.`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Analytics 3: Invitations Sent Count & Delivery Tracking ──
    if (
      (lower.includes("kitne") || lower.includes("kitno") || lower.includes("how many") || lower.includes("total") || lower.includes("status") || lower.includes("bhej")) &&
      (lower.includes("invite") || lower.includes("invitation") || lower.includes("invitations") || lower.includes("bheja") || lower.includes("bheje"))
    ) {
      if (!isHindi) {
        return {
          reply: `**Assessment Invitations Summary:**\n\n` +
            `• ✉️ **Total Invitations Dispatched:** **${context.totalInvitations} invitations**\n` +
            `• ⏳ **In Progress / Awaiting Test:** ${context.inProgressAttempts} candidates\n` +
            `• 📝 **Completed & Evaluated:** ${context.totalAttempts} candidates\n\n` +
            `👉 **Direct Link:** [Monitor Invitation Live Status](/invitations)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `**Assessment Invitations ka Live Status:**\n\n` +
          `• ✉️ **Total Invitations Bheje Gaye:** **${context.totalInvitations} candidates**\n` +
          `• ⏳ **In Progress / Test Pending:** ${context.inProgressAttempts} candidates\n` +
          `• 📝 **Tests Submitted & Evaluated:** ${context.totalAttempts} candidates\n\n` +
          `👉 **Direct Link:** [Live Invitation Dashboard Dekhein](/invitations)`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Analytics 4: Top Performing Candidates ──
    if (
      lower.includes("top candidate") ||
      lower.includes("top candidates") ||
      lower.includes("top score") ||
      lower.includes("topper") ||
      lower.includes("highest score") ||
      lower.includes("best candidate")
    ) {
      if (context.topAttempts.length > 0) {
        const topList = context.topAttempts.slice(0, 5).map((a, idx) => {
          const name = `${a.candidate?.firstName || ""} ${a.candidate?.lastName || ""}`.trim() || a.candidate?.email || "Candidate";
          return `**${idx + 1}. ${name}** — **${Math.round(a.percentage || 0)}%** in *${a.assessment?.title || "Assessment"}* (${a.candidate?.email || ""}) [${a.result || "QUALIFIED"}]`;
        }).join("\n");

        if (!isHindi) {
          return {
            reply: `Here are the **top-performing candidates across all assessments:**\n\n` +
              topList + `\n\n👉 **Direct Link:** [View Full Leaderboard & Proctoring](/results)`,
            model: "hirequest-copilot-engine",
            poweredBy: "HireQuest Assistant Engine",
          };
        }

        return {
          reply: `HireQuest me **Top-Performing Candidates ki List:**\n\n` +
            topList + `\n\n👉 **Direct Link:** [Live Leaderboard & Proctoring Dekhein](/results)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      if (!isHindi) {
        return {
          reply: `Currently, no candidates have submitted completed assessment tests yet. As candidates complete tests, top performers and scorecards will automatically appear on the [Results & Ranking](/results) page.`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `Currently kisi bhi candidate ne assessment test submit nahi kiya hai. Jaise hi candidates test submit karenge, top rankers aur unke scores [Results & Ranking](/results) page par live dikhenge.`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Analytics 5: Assessment Attempt, Pass & Fail Stats ──
    if (
      lower.includes("attempt") ||
      lower.includes("pass") ||
      lower.includes("passed") ||
      lower.includes("fail") ||
      lower.includes("failed") ||
      lower.includes("qualify") ||
      lower.includes("qualifi") ||
      lower.includes("qualified")
    ) {
      const topList = context.topAttempts.length > 0
        ? `\n\n**Top Performers:**\n` + context.topAttempts.slice(0, 3).map((a, idx) => {
            const name = `${a.candidate?.firstName || ""} ${a.candidate?.lastName || ""}`.trim() || a.candidate?.email || "Candidate";
            return `• **${idx + 1}. ${name}** — **${Math.round(a.percentage || 0)}%** [${a.result || "QUALIFIED"}]`;
          }).join("\n")
        : "";

      if (!isHindi) {
        return {
          reply: `**Assessment Submissions & Qualification Summary:**\n\n` +
            `• 📝 **Total Tests Submitted:** **${context.totalAttempts} attempts**\n` +
            `• ✅ **Qualified (Passed):** **${context.passedAttempts} candidates**\n` +
            `• ❌ **Unqualified (Failed):** **${context.failedAttempts} candidates**\n` +
            `• ⏳ **In Progress / Started:** **${context.inProgressAttempts} candidates**` +
            topList + `\n\n👉 **Direct Link:** [View Complete Leaderboard & Scorecards](/results)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `**Assessments Attempt aur Pass/Fail ka Live Summary:**\n\n` +
          `• 📝 **Total Tests Submitted:** **${context.totalAttempts} attempts**\n` +
          `• ✅ **Pass / Qualified:** **${context.passedAttempts} candidates**\n` +
          `• ❌ **Fail / Unqualified:** **${context.failedAttempts} candidates**\n` +
          `• ⏳ **In Progress / Started:** **${context.inProgressAttempts} candidates**` +
          topList + `\n\n👉 **Direct Link:** [Live Leaderboard & Scorecards Dekhein](/results)`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow A: How to Create Assessment / Test Creation Guide ──
    if (
      lower.includes("create") ||
      lower.includes("banao") ||
      lower.includes("bana") ||
      lower.includes("naya") ||
      lower.includes("new") ||
      lower.includes("kese kru") ||
      lower.includes("kaise") ||
      lower.includes("step")
    ) {
      if (
        lower.includes("asement") ||
        lower.includes("assemsent") ||
        lower.includes("assessment") ||
        lower.includes("test") ||
        lower.includes("exam") ||
        lower.includes("screening")
      ) {
        if (!isHindi) {
          return {
            reply: `Here is the step-by-step guide to **create a new assessment in HireQuest:**\n\n` +
              `1. **Go to Assessments:**\n` +
              `   Click **[Assessments](/assessments)** in the left sidebar navigation.\n\n` +
              `2. **Click Create Assessment:**\n` +
              `   Click the **[+ Create Assessment](/assessments/create)** button in the top-right corner.\n\n` +
              `3. **Fill Assessment Details:**\n` +
              `   • **Title:** Enter your test name (e.g. *Full Stack Developer Assessment*).\n` +
              `   • **Duration:** Set test time limit (e.g. *45 minutes*).\n` +
              `   • **Passing Score:** Set minimum qualifying percentage (e.g. *60%*).\n\n` +
              `4. **Add Questions & Cognitive Games:**\n` +
              `   • Select MCQs from your Question Bank (currently **${context.totalQuestions} questions** available).\n` +
              `   • Include Cognitive Games (Focus, Memory, Logic) to evaluate problem-solving ability.\n\n` +
              `5. **Review & Publish:**\n` +
              `   Click **"Publish"** — your assessment is live and ready for candidate invitations!\n\n` +
              `👉 **Direct Link:** [Click here to Create Assessment](/assessments/create)`,
            model: "hirequest-copilot-engine",
            poweredBy: "HireQuest Assistant Engine",
          };
        }

        return {
          reply: `HireQuest me **Naya Assessment Create karne ke Aasan Steps:**\n\n` +
            `1. **Assessments Page par jayein:**\n` +
            `   Left navigation menu me **[Assessments](/assessments)** par click karein.\n\n` +
            `2. **Create Assessment Button:**\n` +
            `   Page ke top-right corner par bane **[+ Create Assessment](/assessments/create)** button par click karein.\n\n` +
            `3. **Test Details fill karein:**\n` +
            `   • **Title:** Test ka naam likhein (jaise *Full Stack Developer Assessment*).\n` +
            `   • **Duration:** Test ki time limit set karein (e.g. *45 minutes*).\n` +
            `   • **Passing Score:** Minimum passing percentage set karein (e.g. *60%*).\n\n` +
            `4. **Questions & Cognitive Games jodein:**\n` +
            `   • Hamare Question Bank se MCQs select karein (currently bank me **${context.totalQuestions} questions** available hain).\n` +
            `   • Candidate problem-solving test karne ke liye Cognitive Games (Focus, Memory) include karein.\n\n` +
            `5. **Publish karein:**\n` +
            `   Test review karke **"Publish"** dabayein — aapka test live ho jayega aur aap candidates ko invite bhej sakenge!\n\n` +
            `👉 **Direct Link:** [Naya Assessment Banane ke liye Yaha Click Karein](/assessments/create)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }
    }

    // ── Workflow B: Resume Extraction from Email / Mailbox Sync ──
    if (
      lower.includes("extract") ||
      lower.includes("resume") ||
      lower.includes("resumes") ||
      lower.includes("mailbox") ||
      lower.includes("cv") ||
      lower.includes("parse") ||
      lower.includes("sync mailbox")
    ) {
      if (!isHindi) {
        return {
          reply: `Here is how to **extract candidate resumes from incoming emails in HireQuest:**\n\n` +
            `1. **Go to Candidates:**\n` +
            `   Click **[Candidates](/candidates)** in the left sidebar menu.\n\n` +
            `2. **Connect Recruiter Mailbox:**\n` +
            `   In the **"Recruiter Mailbox"** card at the top, connect your official hiring Gmail account.\n\n` +
            `3. **Sync Mailbox:**\n` +
            `   Click the **"Sync Mailbox"** button to fetch the latest job application emails.\n\n` +
            `4. **Extract from Emails:**\n` +
            `   Click **"Extract from Emails"** — HireQuest AI automatically parses attached PDF/Word resumes and creates structured Candidate Profiles!\n\n` +
            `👉 **Direct Link:** [Go to Candidates & Mailbox Page](/candidates)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `HireQuest me **Emails se Candidate Resumes Extract karne ke Steps:**\n\n` +
          `1. **Candidates Page par jayein:**\n` +
          `   Left sidebar menu me **[Candidates](/candidates)** par click karein.\n\n` +
          `2. **Recruiter Mailbox Connect karein:**\n` +
          `   Top section me **"Recruiter Mailbox"** card par apna official hiring Gmail account connect karein.\n\n` +
          `3. **Mailbox Sync karein:**\n` +
          `   **"Sync Mailbox"** button par click karein taaki latest incoming job application emails fetch ho jayein.\n\n` +
          `4. **Extract from Emails:**\n` +
          `   **"Extract from Emails"** button dabayein — HireQuest AI automatic sabhi emails ke attached PDF/Word resumes ko scan karke Candidate Profiles create kar dega!\n\n` +
          `👉 **Direct Link:** [Candidates & Mailbox Page par Jayein](/candidates)`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow C: Candidate Test Invitation / Link Sharing ──
    if (
      lower.includes("invite") ||
      lower.includes("invitation") ||
      lower.includes("invitations") ||
      lower.includes("send invite") ||
      lower.includes("link bhejo") ||
      lower.includes("test link") ||
      lower.includes("bhejna") ||
      lower.includes("bheju") ||
      lower.includes("kaise bheje")
    ) {
      if (!isHindi) {
        return {
          reply: `Here are the steps to **invite candidates and share assessment test links:**\n\n` +
            `1. **Go to Invitations:**\n` +
            `   Click **[Invitations](/invitations)** in the left sidebar menu.\n\n` +
            `2. **Click Invite Candidate:**\n` +
            `   Click the **"+ Invite Candidate"** button in the top bar.\n\n` +
            `3. **Select Details:**\n` +
            `   • Enter the candidate's email address.\n` +
            `   • Select your published Assessment from the dropdown.\n\n` +
            `4. **Send Invitation:**\n` +
            `   Click **"Send Invitation"** — a unique, secure test invitation link is immediately sent to the candidate's inbox!\n\n` +
            `💡 *Note: You can track live candidate test progress (Opened, Started, Submitted) directly on the [Invitations](/invitations) dashboard.*`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `Candidate ko **Assessment Invitation / Test Link Bhejne ke Steps:**\n\n` +
          `1. **Invitations Page par jayein:**\n` +
          `   Left navigation menu me **[Invitations](/invitations)** par click karein.\n\n` +
          `2. **Invite Candidate Button:**\n` +
          `   Top bar par bane **"+ Invite Candidate"** button par click karein.\n\n` +
          `3. **Details select karein:**\n` +
          `   • Candidate ka Email address dalein.\n` +
          `   • Dropdown se apna published Assessment select karein.\n\n` +
          `4. **Send Invitation:**\n` +
          `   **"Send Invitation"** par click karein — Candidate ke inbox me unka unique, secure test magic link turant chala jayega!\n\n` +
          `💡 *Note: Candidate ke test shuru karne aur submit karne ka live status aap isi [Invitations](/invitations) page par monitor kar sakte hain.*`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow D: Results, Rankings & Proctoring Check ──
    if (
      lower.includes("result") ||
      lower.includes("results") ||
      lower.includes("ranking") ||
      lower.includes("rankings") ||
      lower.includes("leaderboard") ||
      lower.includes("cheating") ||
      lower.includes("proctoring") ||
      lower.includes("scorecard")
    ) {
      if (context.topAttempts.length > 0) {
        const topList = context.topAttempts.slice(0, 3).map((a, idx) => {
          const name = `${a.candidate?.firstName || ""} ${a.candidate?.lastName || ""}`.trim() || a.candidate?.email || "Candidate";
          return `**${idx + 1}. ${name}** — **${Math.round(a.percentage || 0)}%** in *${a.assessment?.title || "Assessment"}* (${a.candidate?.email || ""})`;
        }).join("\n");

        return {
          reply: (!isHindi
            ? `Here are the top-performing candidates from your live assessments:\n\n${topList}\n\n• **Detailed Proctoring:** Visit the [Results & Ranking](/results) page to view face recognition logs, tab switches, and game scorecards.`
            : `Here are the top-performing candidates from your live assessments:\n\n${topList}\n\n• **Detailed Proctoring:** Face detection match, tab switches aur game scorecards dekhne ke liye [Results & Ranking](/results) page par jayein.`),
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      if (!isHindi) {
        return {
          reply: `Here is how to **review candidate test results and anti-cheating proctoring reports:**\n\n` +
            `1. **Go to Results & Ranking:**\n` +
            `   Click **[Results & Ranking](/results)** in the left navigation menu.\n\n` +
            `2. **Review Leaderboard & Scores:**\n` +
            `   Check overall test percentages, rankings, and Qualified / Disqualified statuses.\n\n` +
            `3. **Detailed Candidate Scorecard & Proctoring:**\n` +
            `   Click on any candidate to inspect their **Face Recognition logs**, tab switch violations, and cognitive metrics.\n\n` +
            `Currently, there are **${context.totalCandidates} candidates registered** in your candidate pool.\n\n` +
            `👉 **Direct Link:** [View Live Leaderboard & Results](/results)`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `Candidate ke **Results aur Anti-Cheating Proctoring Report dekhne ke Steps:**\n\n` +
          `1. **Results & Ranking Page par jayein:**\n` +
          `   Left menu me **[Results & Ranking](/results)** par click karein.\n\n` +
          `2. **Leaderboard & Filters:**\n` +
          `   Sabhi submitted tests ka overall percentage, ranking, aur Pass/Fail qualification status dekhein.\n\n` +
          `3. **Detailed Candidate Scorecard:**\n` +
          `   Kisi bhi candidate par click karke unki **Face Verification**, tab switches, aur cognitive scores ka full scorecard review karein.\n\n` +
          `Currently hamare candidate pool me **${context.totalCandidates} candidates registered** hain (submissions in progress).\n\n` +
          `👉 **Direct Link:** [Live Leaderboard & Results Dekhein](/results)`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow E: Question Bank / Questions count & Management ──
    if (
      lower.includes("question") ||
      lower.includes("questions") ||
      lower.includes("sawal") ||
      lower.includes("mcq") ||
      lower.includes("prashn") ||
      lower.includes("bank")
    ) {
      const { totalQuestions, difficultyCounts, sampleQuestions } = context;
      const sampleList = sampleQuestions.length > 0
        ? sampleQuestions.map((q) => `• *${q.title}* (${q.difficulty})`).join("\n")
        : "";

      if (!isHindi) {
        return {
          reply: `Your Question Bank currently contains **${totalQuestions} questions**:\n\n` +
            `• 🟢 **Easy:** ${difficultyCounts.EASY} questions\n` +
            `• 🟡 **Medium:** ${difficultyCounts.MEDIUM} questions\n` +
            `• 🔴 **Hard:** ${difficultyCounts.HARD} questions\n\n` +
            (sampleList ? `**Recent Questions:**\n${sampleList}\n\n` : "") +
            `You can visit the **[Question Bank](/question-bank)** to filter questions by topic or click **"+ Add Question"** to create new questions.`,
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }

      return {
        reply: `Hamare Question Bank me currently **${totalQuestions} questions** available hain:\n\n` +
          `• 🟢 **Easy:** ${difficultyCounts.EASY} questions\n` +
          `• 🟡 **Medium:** ${difficultyCounts.MEDIUM} questions\n` +
          `• 🔴 **Hard:** ${difficultyCounts.HARD} questions\n\n` +
          (sampleList ? `**Recent Questions:**\n${sampleList}\n\n` : "") +
          `Aap [Question Bank](/question-bank) page par jakar naye questions add kar sakte hain ya existing questions ko filter karke review kar sakte hain.`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow F: Specific Candidate Search by Name or Email ──
    if (context.recentCandidates && context.recentCandidates.length > 0) {
      const words = lower.split(/\s+/);
      const matchedCandidate = context.recentCandidates.find((c) => {
        const fn = (c.firstName || "").toLowerCase();
        const ln = (c.lastName || "").toLowerCase();
        const em = (c.email || "").toLowerCase();
        return (
          (fn && words.some((w) => w.length > 2 && fn.includes(w))) ||
          (ln && words.some((w) => w.length > 2 && ln.includes(w))) ||
          (em && lower.includes(em))
        );
      });

      if (matchedCandidate) {
        const candName = `${matchedCandidate.firstName || ""} ${matchedCandidate.lastName || ""}`.trim() || matchedCandidate.email;
        const attempt = context.topAttempts.find((a) =>
          a.candidate?.email?.toLowerCase() === matchedCandidate.email?.toLowerCase()
        );

        if (attempt) {
          return {
            reply: `Candidate **${candName}** (${matchedCandidate.email}) ka scorecard:\n\n` +
              `• **Assessment:** ${attempt.assessment?.title || "Assessment"}\n` +
              `• **Score:** ${Math.round(attempt.percentage || 0)}% (${attempt.score || 0} marks)\n` +
              `• **Result:** **${attempt.result || "QUALIFIED"}**\n` +
              `• **Submitted At:** ${new Date(attempt.submittedAt).toLocaleDateString()}\n\n` +
              `Full proctoring scorecard aap [Results & Ranking](/results) page par dekh sakte hain.`,
            model: "hirequest-copilot-engine",
            poweredBy: "HireQuest Assistant Engine",
          };
        } else {
          return {
            reply: `Candidate **${candName}** (${matchedCandidate.email}) hamari candidate pipeline me **registered** hain.\n\n` +
              `• **Current Status:** Assessment pending / Incomplete (Unhone abhi tak test submit nahi kiya hai).\n` +
              `• **Action:** Aap unhe test link resend kar sakte hain ya [Invitations](/invitations) page par unka invite status check kar sakte hain.`,
            model: "hirequest-copilot-engine",
            poweredBy: "HireQuest Assistant Engine",
          };
        }
      }
    }

    // ── Workflow G: Assessments List ──
    if (lower.includes("assessment") || lower.includes("assemsent") || lower.includes("asement") || lower.includes("test")) {
      if (context.assessments.length > 0) {
        const list = context.assessments.map((a) => `• **${a.title}** (Passing Score: ${a.passingScore}%, Duration: ${a.durationMinutes} min, Status: ${a.status})`).join("\n");
        return {
          reply: (!isHindi
            ? `Your organization currently has **${context.assessments.length} active assessment(s)**:\n\n${list}\n\nYou can manage or create new assessments on the [Assessments](/assessments) page.`
            : `Hamare company me **${context.assessments.length} active assessment(s)** available hain:\n\n${list}\n\nAap [Assessments](/assessments) page par jakar naye tests create kar sakte hain.`),
          model: "hirequest-copilot-engine",
          poweredBy: "HireQuest Assistant Engine",
        };
      }
      return {
        reply: (!isHindi
          ? `No active assessments found. Click [Create Assessment](/assessments/create) to build your first test module.`
          : `Currently koi active assessment create nahi kiya gaya hai. Naya test banane ke liye [Create Assessment](/assessments/create) par jayein.`),
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // ── Workflow H: Draft Professional Email Template ──
    if (lower.includes("email") || lower.includes("interview") || lower.includes("template")) {
      return {
        reply: `Here is a professional **Technical Interview Invitation Email Template** for your qualified candidate:

---
**Subject:** Invitation for Next Round: Technical Interview with ${context.companyName}

Dear Candidate,

Congratulations on successfully clearing our screening assessment with high marks! We were very impressed by your problem-solving performance.

We would like to invite you for the next round — a 45-minute virtual technical interview with our engineering panel.

**Interview Details:**
• **Platform:** Google Meet / Zoom
• **Duration:** 45 minutes
• **Agenda:** System discussion, architecture review, and mutual Q&A

Please let us know your availability over the next 2-3 business days.

Best regards,  
**Hiring Team**  
${context.companyName}
---`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    // Default friendly assistant response grounded with live platform stats
    if (!isHindi) {
      return {
        reply: `Hello! I am your **HireQuest HR Copilot**.\n\n` +
          `**Live Platform Overview:**\n` +
          `• 📚 **Question Bank:** ${context.totalQuestions} questions (${context.difficultyCounts.EASY} Easy, ${context.difficultyCounts.MEDIUM} Medium, ${context.difficultyCounts.HARD} Hard)\n` +
          `• 👥 **Candidate Pipeline:** ${context.totalCandidates} registered candidates\n` +
          `• 📝 **Active Assessments:** ${context.assessments.length} module(s)\n` +
          `• ✉️ **Invitations:** ${context.totalInvitations} sent\n\n` +
          `**Common HR Actions you can ask me:**\n` +
          `1. *"How do I create a new assessment?"*\n` +
          `2. *"How do I extract candidate resumes from emails?"*\n` +
          `3. *"How do I invite candidates and send test links?"*\n` +
          `4. *"How many questions are in the Question Bank?"*\n` +
          `5. *"Where can I view candidate scores and proctoring reports?"*`,
        model: "hirequest-copilot-engine",
        poweredBy: "HireQuest Assistant Engine",
      };
    }

    return {
      reply: `Hello! I am your **HireQuest HR Copilot**.\n\n` +
        `**Live Platform Overview:**\n` +
        `• 📚 **Question Bank:** ${context.totalQuestions} questions (${context.difficultyCounts.EASY} Easy, ${context.difficultyCounts.MEDIUM} Medium, ${context.difficultyCounts.HARD} Hard)\n` +
        `• 👥 **Candidate Pipeline:** ${context.totalCandidates} registered candidates\n` +
        `• 📝 **Active Assessments:** ${context.assessments.length} module(s)\n` +
        `• ✉️ **Invitations:** ${context.totalInvitations} sent\n\n` +
        `**Common HR Actions you can ask:**\n` +
        `1. *"Naya assessment kaise create karein?"*\n` +
        `2. *"Emails se resumes kaise extract karein?"*\n` +
        `3. *"Candidate ko test invite kaise bhejein?"*\n` +
        `4. *"Question Bank me kitne questions hain?"*\n` +
        `5. *"Candidate ka result & score kaise dekhein?"*`,
      model: "hirequest-copilot-engine",
      poweredBy: "HireQuest Assistant Engine",
    };
  }
}

module.exports = new AIService();
