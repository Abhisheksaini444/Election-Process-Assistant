const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);

const buckets = new Map();

const getClientKey = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

export const rateLimiter = (req, res, next) => {
  const now = Date.now();
  const key = getClientKey(req);
  const current = buckets.get(key);

  if (!current || current.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return next();
  }

  if (current.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((current.expiresAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many requests. Please retry later.',
      reason: 'RATE_LIMITED',
      suggestion: 'Wait briefly before sending another verification request.'
    });
  }

  current.count += 1;
  buckets.set(key, current);
  return next();
};

export const __resetRateLimiterForTests = () => {
  buckets.clear();
};
