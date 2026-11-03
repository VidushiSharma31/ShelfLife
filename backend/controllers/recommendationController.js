const { requestSchema, recommend } = require("../services/recommendationService");
const {
  describeProviderError,
  isQuotaError,
  isCredentialError,
  isModelUnavailableError,
  isOverloadedError,
} = require("../services/geminiProvider");

const sendChatError = (error, res) => {
  if (error.code === "GEMINI_NOT_CONFIGURED") {
    return res.status(503).json({ message: "Book Buddy is not configured yet. Add GEMINI_API_KEY to the backend environment." });
  }
  if (error.code === "GEMINI_TIMEOUT") {
    console.error("Gemini request failed: TIMEOUT");
    return res.status(504).json({ message: "Book Buddy took too long to respond. Please try again." });
  }
  if (error.code === "GEMINI_INVALID_RESPONSE") {
    console.error(`Gemini request failed: INVALID_RESPONSE${error.detail ? ` (${error.detail})` : ""}`);
    return res.status(502).json({ message: "Book Buddy couldn't format a safe recommendation. Please try again." });
  }
  if (error.code === "OPEN_LIBRARY_UNAVAILABLE") {
    console.error(`Book Buddy Open Library retrieval failed: ${error.upstreamCode || "UPSTREAM_ERROR"}`);
    if (error.upstreamCode === "OPEN_LIBRARY_TIMEOUT") {
      return res.status(504).json({ code: "OPEN_LIBRARY_TIMEOUT", message: "Live book verification is taking too long right now. Please try again shortly." });
    }
    return res.status(503).json({ code: "OPEN_LIBRARY_UNAVAILABLE", message: "Live book verification is temporarily unavailable. Please try again shortly." });
  }

  if (isCredentialError(error)) {
    console.error(`Gemini request failed: CREDENTIALS_REJECTED | ${describeProviderError(error)}`);
    return res.status(503).json({ message: "Book Buddy could not connect to Gemini. Check the backend API key configuration." });
  }
  if (isQuotaError(error)) {
    console.error(`Gemini request failed: RATE_LIMIT_OR_QUOTA | ${describeProviderError(error)}`);
    return res.status(429).json({ message: "Book Buddy is at its Gemini usage limit right now. Please try again later." });
  }
  if (isModelUnavailableError(error)) {
    console.error(`Gemini request failed: MODEL_UNAVAILABLE | ${describeProviderError(error)}`);
    return res.status(503).json({ message: "Book Buddy's AI model is unavailable right now. Please try again later." });
  }
  if (isOverloadedError(error)) {
    console.error(`Gemini request failed: OVERLOADED | ${describeProviderError(error)}`);
    return res.status(503).json({ message: "Gemini is busy right now. Please try again in a moment." });
  }
  if (/fetch failed|network|econn|enotfound|eai_again/i.test(`${error?.code || ""} ${error?.message || ""} ${error?.cause?.code || ""}`)) {
    console.error(`Gemini request failed: NETWORK_ERROR | ${describeProviderError(error)}`);
    return res.status(502).json({ message: "Book Buddy couldn't connect to Gemini right now. Please try again." });
  }
  // Log the real status/message (API key redacted) instead of just "Error",
  // otherwise there is no way to tell what Google actually rejected.
  console.error(`Gemini request failed: UNCLASSIFIED | ${describeProviderError(error)}`);
  return res.status(502).json({ message: "Book Buddy couldn't complete that request. Please try again." });
};

const chat = async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Send a message up to 1,000 characters and at most 8 recent messages." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ message: "Book Buddy is not configured yet. Add GEMINI_API_KEY to the backend environment." });
  }

  try {
    const result = await recommend({
      userId: req.authenticatedUserId,
      ...parsed.data,
    });
    return res.json(result);
  } catch (error) {
    return sendChatError(error, res);
  }
};

module.exports = { chat, sendChatError };
