const TTL_MS = Number(process.env.CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const LIVE_CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS || 10 * 60 * 1000);

const cache = new Map();

const normalizeClaimKey = (claim, language = 'en', variant = 'default') => {
  const normalizedClaim = claim.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${variant}::${language}::${normalizedClaim}`;
};

export const getCachedResult = (claim, language = 'en', variant = 'default') => {
  const key = normalizeClaimKey(claim, language, variant);
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.data;
};

export const setCachedResult = (claim, data, language = 'en', variant = 'default') => {
  const key = normalizeClaimKey(claim, language, variant);
  const ttl = String(variant).includes('live:1') ? LIVE_CACHE_TTL_MS : TTL_MS;
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl
  });
};

export const __resetCacheForTests = () => {
  cache.clear();
};
