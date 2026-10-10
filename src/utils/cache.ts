const cache = new Map<string, { data: any, expiresAt: number }>();

export const getCache = (key: string) => {
  const item = cache.get(key);
  if (item && item.expiresAt > Date.now()) return item.data;
  return null;
};

export const setCache = (key: string, data: any, ttlMs: number = 300000) => {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
};

export const invalidateCacheByPrefix = (prefix: string) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};
