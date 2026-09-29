type Bucket = {
  failures: number;
  resetAt: number;
};

const windowMs = 15 * 60 * 1000;
const maxFailuresPerIp = 20;
const maxFailuresPerUsername = 10;
const buckets = new Map<string, Bucket>();

// In-memory, so it resets on restart and is per server process. That is
// enough to stop password guessing against a single small deployment.
export function getLoginBlockSeconds(ip: string, username: string) {
  const now = Date.now();
  pruneExpired(now);

  const blockedUntil = Math.max(
    getBlockedUntil(`ip:${ip}`, maxFailuresPerIp, now),
    getBlockedUntil(`user:${username}`, maxFailuresPerUsername, now),
  );

  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

export function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();

  for (const key of [`ip:${ip}`, `user:${username}`]) {
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { failures: 1, resetAt: now + windowMs });
    } else {
      bucket.failures += 1;
    }
  }
}

export function clearLoginFailures(username: string) {
  buckets.delete(`user:${username}`);
}

export function getClientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function getBlockedUntil(key: string, maxFailures: number, now: number) {
  const bucket = buckets.get(key);

  return bucket && bucket.resetAt > now && bucket.failures >= maxFailures
    ? bucket.resetAt
    : 0;
}

function pruneExpired(now: number) {
  if (buckets.size < 1000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
