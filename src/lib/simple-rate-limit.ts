const buckets = new Map<string, { count: number; resetAt: number }>();

// In-memory counter per key (e.g. IP address) for public endpoints; resets
// on restart, which is fine for a single small server.
export function isRateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();

  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;

  return bucket.count > max;
}
