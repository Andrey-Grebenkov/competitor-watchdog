interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Периодическая чистка, чтобы карта не росла бесконечно. */
function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

export interface RateLimitOptions {
  /** Ключ ограничения, например `login:user@example.com`. */
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Секунды до сброса окна. */
  retryAfterSeconds: number;
}

/**
 * Простое ограничение частоты в памяти процесса (fixed window). Тормозит
 * подбор паролей и спам форм; при нескольких инстансах ограничение действует
 * на каждый инстанс отдельно.
 */
export function rateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  if (windows.size > 10_000) {
    sweep(now);
  }

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
  };
}
