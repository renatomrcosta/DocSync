import {
  DocSyncError,
  GitOperationError,
  LLMError,
  PRCreationError,
  WebhookValidationError,
  calculateBackoff,
  sleep,
  withRetry,
  logger,
} from "../index";

describe("Error Classes", () => {
  describe("DocSyncError", () => {
    it("should create error with code and retryable flag", () => {
      const error = new DocSyncError("Test error", "TEST_ERROR", true, { key: "value" });

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ key: "value" });
      expect(error.name).toBe("DocSyncError");
    });

    it("should default retryable to false", () => {
      const error = new DocSyncError("Test error", "TEST_ERROR");

      expect(error.retryable).toBe(false);
    });
  });

  describe("GitOperationError", () => {
    it("should create error with GIT_OPERATION_ERROR code", () => {
      const error = new GitOperationError("Git failed", { repo: "test" });

      expect(error.message).toBe("Git failed");
      expect(error.code).toBe("GIT_OPERATION_ERROR");
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ repo: "test" });
      expect(error.name).toBe("GitOperationError");
    });
  });

  describe("LLMError", () => {
    it("should be retryable for 429 status code", () => {
      const error = new LLMError("Rate limited", 429);

      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
    });

    it("should be retryable for 5xx status codes", () => {
      const error500 = new LLMError("Server error", 500);
      const error503 = new LLMError("Service unavailable", 503);

      expect(error500.retryable).toBe(true);
      expect(error503.retryable).toBe(true);
    });

    it("should not be retryable for 4xx status codes (except 429)", () => {
      const error400 = new LLMError("Bad request", 400);
      const error401 = new LLMError("Unauthorized", 401);

      expect(error400.retryable).toBe(false);
      expect(error401.retryable).toBe(false);
    });

    it("should not be retryable when no status code", () => {
      const error = new LLMError("Unknown error");

      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe("PRCreationError", () => {
    it("should create error with PR_CREATION_ERROR code", () => {
      const error = new PRCreationError("PR failed", { prNumber: 123 });

      expect(error.code).toBe("PR_CREATION_ERROR");
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("PRCreationError");
    });
  });

  describe("WebhookValidationError", () => {
    it("should create non-retryable error", () => {
      const error = new WebhookValidationError("Invalid signature");

      expect(error.code).toBe("WEBHOOK_VALIDATION_ERROR");
      expect(error.retryable).toBe(false);
      expect(error.name).toBe("WebhookValidationError");
    });
  });
});

describe("Retry Utilities", () => {
  describe("calculateBackoff", () => {
    it("should calculate exponential delay", () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      // First attempt (attempt 0): 1000 * 2^0 = 1000 + jitter
      const delay0 = calculateBackoff(0, baseDelay, maxDelay);
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1300); // max jitter is 30%

      // Second attempt (attempt 1): 1000 * 2^1 = 2000 + jitter
      const delay1 = calculateBackoff(1, baseDelay, maxDelay);
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2600);
    });

    it("should cap delay at maxDelay", () => {
      const baseDelay = 1000;
      const maxDelay = 5000;

      // Large attempt would exceed max
      const delay = calculateBackoff(10, baseDelay, maxDelay);
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });
  });

  describe("sleep", () => {
    it("should delay for specified duration", async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
    });
  });

  describe("withRetry", () => {
    it("should return result on success", async () => {
      const fn = jest.fn().mockResolvedValue("success");

      const result = await withRetry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors", async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new GitOperationError("Temp failure"))
        .mockResolvedValue("success");

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry non-retryable errors", async () => {
      const nonRetryableError = new WebhookValidationError("Invalid");
      const fn = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(nonRetryableError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries exceeded", async () => {
      const error = new GitOperationError("Persistent failure");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 }))
        .rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should use custom shouldRetry predicate", async () => {
      const error = new Error("Custom error");
      const fn = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue("success");

      const result = await withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 50,
        shouldRetry: () => true,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry regular errors by default", async () => {
      const error = new Error("Regular error");
      const fn = jest.fn().mockRejectedValue(error);

      await expect(withRetry(fn)).rejects.toThrow(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Logger", () => {
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, "debug").mockImplementation(),
      info: jest.spyOn(console, "info").mockImplementation(),
      warn: jest.spyOn(console, "warn").mockImplementation(),
      error: jest.spyOn(console, "error").mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should log debug messages", () => {
    logger.debug("Debug message", { key: "value" });

    expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.debug.mock.calls[0][0]);
    expect(logOutput.level).toBe("debug");
    expect(logOutput.message).toBe("Debug message");
    expect(logOutput.key).toBe("value");
    expect(logOutput.timestamp).toBeDefined();
  });

  it("should log info messages", () => {
    logger.info("Info message");

    expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.info.mock.calls[0][0]);
    expect(logOutput.level).toBe("info");
    expect(logOutput.message).toBe("Info message");
  });

  it("should log warn messages", () => {
    logger.warn("Warning message", { count: 5 });

    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.warn.mock.calls[0][0]);
    expect(logOutput.level).toBe("warn");
    expect(logOutput.message).toBe("Warning message");
    expect(logOutput.count).toBe(5);
  });

  it("should log error messages with DocSyncError details", () => {
    const error = new GitOperationError("Git failed", { repo: "test" });
    logger.error("Operation failed", error);

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(logOutput.level).toBe("error");
    expect(logOutput.message).toBe("Operation failed");
    expect(logOutput.errorCode).toBe("GIT_OPERATION_ERROR");
    expect(logOutput.errorMessage).toBe("Git failed");
    expect(logOutput.retryable).toBe(true);
    expect(logOutput.errorContext).toEqual({ repo: "test" });
  });

  it("should log error messages with regular Error details", () => {
    const error = new Error("Something went wrong");
    logger.error("Unexpected error", error);

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(logOutput.level).toBe("error");
    expect(logOutput.errorMessage).toBe("Something went wrong");
    expect(logOutput.errorStack).toBeDefined();
  });

  it("should log error messages with string error", () => {
    logger.error("Error occurred", "string error");

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(logOutput.error).toBe("string error");
  });

  it("should log error without error object", () => {
    logger.error("Simple error");

    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    const logOutput = JSON.parse(consoleSpy.error.mock.calls[0][0]);
    expect(logOutput.message).toBe("Simple error");
  });
});
