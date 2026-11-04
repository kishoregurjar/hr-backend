const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const aiService = require("./ai.service");

class AIController {
  chat = asyncHandler(async (req, res) => {
    const { message, history } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Message is required and cannot be empty.",
      });
    }

    const result = await aiService.processHRCopilotChat({
      message: message.trim(),
      history: Array.isArray(history) ? history : [],
      user: req.user,
    });

    return SuccessResponse.send(
      res,
      {
        message: "AI Copilot response generated.",
        data: result,
      },
      StatusCodes.OK
    );
  });

  getStatus = asyncHandler(async (req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);

    return SuccessResponse.send(
      res,
      {
        message: "AI Service status retrieved.",
        data: {
          configured: hasKey,
          provider: hasKey ? "Google Gemini AI" : "Built-in Copilot Engine",
          model: hasKey ? "gemini-1.5-flash" : "hirequest-copilot-engine",
        },
      },
      StatusCodes.OK
    );
  });
}

module.exports = new AIController();

