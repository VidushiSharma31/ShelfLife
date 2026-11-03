const DEFAULT_MODEL = "gemini-3.8-flash";
// gemini-2.5-flash is closed to new API users (404), so fall back to other current Flash models.
const DEFAULT_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;
const MAX_TIMEOUT_MS = 40000;
// Gemini 2.5/3 "thinking" models spend part of this budget on internal reasoning,
// so a small limit (the old value was 700) can leave no room for the JSON answer.
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

// Kept for backwards compatibility; the model actually used is read from env at call time.
const GEMINI_MODEL = DEFAULT_MODEL;

const boundedEnvInteger = (name, fallback, min, max) => {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/*
  Gemini 3.x Flash models "think" before answering, which is the usual reason a simple
  JSON recommendation takes 10-30+ seconds. A low thinking level keeps the answer quality
  for this task and cuts latency a lot. Set GEMINI_THINKING_LEVEL=off to send nothing.
  Only applied to full gemini-3.x Flash models (not -lite); others keep their defaults.
*/
const getThinkingConfig = (modelName) => {
  // First word only, so a stray inline comment in .env can't leak into the request.
  const level = (process.env.GEMINI_THINKING_LEVEL ?? "low").trim().toLowerCase().split(/\s+/)[0];
  if (!["minimal", "low", "medium", "high"].includes(level)) return undefined;
  if (!/^gemini-3(\.\d+)?-flash(-preview)?$/.test(modelName)) return undefined;
  return { thinkingLevel: level };
};

const getModelChain = () => {
  const primary = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  // Comma-separated list. Set GEMINI_FALLBACK_MODELS= (empty) to disable fallbacks.
  const raw = process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL;
  const fallbacks = raw === undefined ? DEFAULT_FALLBACK_MODELS : raw.split(",").map((name) => name.trim());
  return [...new Set([primary, ...fallbacks.filter(Boolean)])];
};

const redact = (text) => String(text || "")
  .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
  .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
  .replace(/\s+/g, " ")
  .slice(0, 400);

/* One-line, key-safe description of a provider error, for server logs only. */
const describeProviderError = (error) => {
  const status = error?.status || error?.response?.status;
  return [
    status ? `status=${status}` : "",
    error?.code ? `code=${error.code}` : "",
    error?.name && error.name !== "Error" ? error.name : "",
    redact(error?.message) || "no message",
  ].filter(Boolean).join(" | ");
};

const errorStatus = (error) => Number(error?.status || error?.response?.status) || 0;
const errorText = (error) => `${error?.status || ""} ${error?.code || ""} ${error?.message || ""}`.toLowerCase();

const isQuotaError = (error) => errorStatus(error) === 429 || /quota|resource_exhausted|rate limit/.test(errorText(error));

const isCredentialError = (error) => [401, 403].includes(errorStatus(error))
  || /api key not valid|invalid api key|api_key_invalid|unauthorized|permission denied/.test(errorText(error));

const isModelUnavailableError = (error) => errorStatus(error) === 404
  || (/\bmodels?\b/.test(errorText(error))
    && /not found|not supported|no longer available|deprecated|does not exist/.test(errorText(error)));

const isOverloadedError = (error) => errorStatus(error) >= 500
  || /overloaded|high demand|temporarily unavailable|service unavailable/.test(errorText(error));

const isTransientProviderError = (error) => {
  if (error?.noRetry) return false;
  const message = errorText(error);
  if (/quota|resource_exhausted|invalid api key|unauthorized|permission denied/.test(message)) return false;
  const status = errorStatus(error);
  if (status === 408 || status === 429 || status >= 500) return true;
  const code = error?.cause?.code || error?.code;
  return error?.code === "GEMINI_TIMEOUT"
    || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(code)
    || /overloaded|high demand|temporarily unavailable/.test(message)
    || (error instanceof TypeError && /fetch failed/i.test(error.message));
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const invokeWithRetry = async (invoke, {
  retries = boundedEnvInteger("GEMINI_RETRIES", DEFAULT_RETRIES, 0, 1),
} = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await invoke();
    } catch (error) {
      if (attempt >= retries || !isTransientProviderError(error)) throw error;
      await wait(150 * (2 ** attempt));
    }
  }
};

const invokeModel = async (modelName, messages, apiKey) => {
  const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0.25,
    maxOutputTokens: boundedEnvInteger("GEMINI_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS, 512, 8192),
    maxRetries: 0,
    json: true,
    ...(getThinkingConfig(modelName) ? { thinkingConfig: getThinkingConfig(modelName) } : {}),
    // Streaming stays on on purpose: in @langchain/google-genai the non-streaming path
    // does not forward the AbortSignal, so the timeout below would not work without it.
    streaming: true,
  });

  return invokeWithRetry(async () => {
    const controller = new AbortController();
    const timeoutMs = boundedEnvInteger("GEMINI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 1000, MAX_TIMEOUT_MS);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await model.invoke(messages, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error("Gemini request timed out");
        timeoutError.code = "GEMINI_TIMEOUT";
        timeoutError.noRetry = true;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
};

const invokeGemini = async (messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Gemini is not configured");
    error.code = "GEMINI_NOT_CONFIGURED";
    throw error;
  }

  const models = getModelChain();
  let lastError;
  for (let index = 0; index < models.length; index += 1) {
    try {
      return await invokeModel(models[index], messages, apiKey);
    } catch (error) {
      lastError = error;
      const hasFallback = index < models.length - 1;
      // Fall back only when a different model could plausibly succeed:
      // model missing/retired, provider overloaded, or this model's quota used up.
      // Never on bad credentials. A timeout also falls back: the other model may be faster.
      const canFallBack = hasFallback
        && !isCredentialError(error)
        && (error?.code === "GEMINI_TIMEOUT"
          || isModelUnavailableError(error) || isOverloadedError(error) || isQuotaError(error)
          || (errorStatus(error) === 400 && /thinking/.test(errorText(error))));
      console.error(`Gemini model "${models[index]}" failed: ${describeProviderError(error)}`);
      if (!canFallBack) throw error;
      console.warn(`Falling back to Gemini model "${models[index + 1]}"`);
    }
  }
  throw lastError;
};

module.exports = {
  GEMINI_MODEL,
  invokeGemini,
  invokeWithRetry,
  isTransientProviderError,
  describeProviderError,
  getModelChain,
  getThinkingConfig,
  isQuotaError,
  isCredentialError,
  isModelUnavailableError,
  isOverloadedError,
};
