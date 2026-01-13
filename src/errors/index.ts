/**
 * Custom error classes for DocSync
 */

export class DocSyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DocSyncError";
  }
}

export class GitOperationError extends DocSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "GIT_OPERATION_ERROR", true, context);
    this.name = "GitOperationError";
  }
}

export class LLMError extends DocSyncError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    const retryable = statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
    super(message, "LLM_ERROR", retryable, context);
    this.name = "LLMError";
  }
}

export class PRCreationError extends DocSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "PR_CREATION_ERROR", true, context);
    this.name = "PRCreationError";
  }
}

export class WebhookValidationError extends DocSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "WEBHOOK_VALIDATION_ERROR", false, context);
    this.name = "WebhookValidationError";
  }
}

export class SlackNotificationError extends DocSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "SLACK_NOTIFICATION_ERROR", true, context);
    this.name = "SlackNotificationError";
  }
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retry predicate - retries on retryable DocSyncErrors
 */
function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof DocSyncError) {
    return error.retryable;
  }
  return false;
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
      logger.warn("Retrying operation", {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured logger for consistent logging across the application
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    this._log("debug", message, context);
  },

  info(message: string, context?: Record<string, unknown>) {
    this._log("info", message, context);
  },

  warn(message: string, context?: Record<string, unknown>) {
    this._log("warn", message, context);
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    const errorContext: Record<string, unknown> = { ...context };

    if (error instanceof DocSyncError) {
      errorContext.errorCode = error.code;
      errorContext.errorMessage = error.message;
      errorContext.retryable = error.retryable;
      if (error.context) {
        errorContext.errorContext = error.context;
      }
    } else if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorStack = error.stack;
    } else if (error !== undefined) {
      errorContext.error = String(error);
    }

    this._log("error", message, errorContext);
  },

  _log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  },
};
