/**
 * Fixed-window counters keyed by client IP, in memory. Limits are per
 * process; several replicas need a shared store such as Redis. Headers follow
 * the IETF RateLimit draft (RateLimit-Policy and RateLimit).
 */
export class FixedWindowLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private sweeper: NodeJS.Timeout;

  constructor(
    readonly name: string,
    readonly limit: number,
    readonly windowMs: number,
  ) {
    // Drop finished windows so idle clients do not accumulate.
    this.sweeper = setInterval(() => this.sweep(), windowMs);
    this.sweeper.unref();
  }

  hit(key: string, now = Date.now()): { allowed: boolean; headers: Record<string, string> } {
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count++;
    const remaining = Math.max(0, this.limit - window.count);
    const reset = Math.ceil((window.resetAt - now) / 1000);
    const headers: Record<string, string> = {
      'RateLimit-Policy': `"${this.name}";q=${this.limit};w=${Math.ceil(this.windowMs / 1000)}`,
      RateLimit: `"${this.name}";r=${remaining};t=${reset}`,
    };
    const allowed = window.count <= this.limit;
    if (!allowed) headers['Retry-After'] = String(reset);
    return { allowed, headers };
  }

  sweep(now = Date.now()): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }

  stop(): void {
    clearInterval(this.sweeper);
  }
}
