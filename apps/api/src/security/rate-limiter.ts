export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  assertWithinLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (current.count >= limit) {
      throw new Error("Rate limit exceeded.");
    }

    current.count += 1;
  }
}
