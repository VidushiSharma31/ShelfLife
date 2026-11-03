const WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 5000;
const buckets = new Map();

const checkBucket = (key, limit, now) => {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= limit) return bucket.resetAt;
  bucket.count += 1;
  return null;
};

const pruneBuckets = (now) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

const recommendationRateLimit = (req, res, next) => {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) pruneBuckets(now);
  if (buckets.size >= MAX_BUCKETS) {
    return res.status(503).json({ message: "Book Buddy is busy. Please try again shortly." });
  }

  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const userId = req.authenticatedUserId;
  const requestBucket = userId ? `user:${userId}` : `guest:${ip}`;
  const requestLimit = userId ? 8 : 3;
  const retryAt = checkBucket(requestBucket, requestLimit, now)
    || (userId ? checkBucket(`ip:${ip}`, 16, now) : null);

  if (retryAt) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((retryAt - now) / 1000))));
    return res.status(429).json({ message: "You’ve reached the Book Buddy message limit. Please try again in a few minutes." });
  }
  return next();
};

module.exports = { recommendationRateLimit };
