import {
  createSlackClient,
  sendNotification,
  formatMessage,
  SlackClient,
  SlackNotificationOptions,
} from "../index";
import { SlackNotificationError } from "../../errors/index";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console for logger
jest.spyOn(console, "info").mockImplementation();
jest.spyOn(console, "warn").mockImplementation();
jest.spyOn(console, "error").mockImplementation();

describe("Slack Module", () => {
  const baseOptions: SlackNotificationOptions = {
    docsPR: {
      number: 42,
      url: "https://github.com/org/docs/pull/42",
      title: "docs: Update API documentation",
    },
    sourcePR: {
      number: 100,
      url: "https://github.com/org/api/pull/100",
      title: "feat: Add new endpoint",
      repository: "org/api",
    },
    summary: "Updated API documentation to reflect new endpoint changes",
    filesChanged: ["docs/api.md", "docs/endpoints.md"],
    reviewers: ["john-doe", "jane-smith"],
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("createSlackClient", () => {
    it("should create client with webhook URL", () => {
      const client = createSlackClient("https://hooks.slack.com/test");

      expect(client.webhookUrl).toBe("https://hooks.slack.com/test");
      expect(client.maxRetries).toBe(3);
      expect(client.channel).toBeUndefined();
    });

    it("should create client with optional channel", () => {
      const client = createSlackClient("https://hooks.slack.com/test", {
        channel: "#docs-updates",
      });

      expect(client.channel).toBe("#docs-updates");
    });

    it("should create client with custom maxRetries", () => {
      const client = createSlackClient("https://hooks.slack.com/test", {
        maxRetries: 5,
      });

      expect(client.maxRetries).toBe(5);
    });

    it("should create client with all options", () => {
      const client = createSlackClient("https://hooks.slack.com/test", {
        channel: "#alerts",
        maxRetries: 2,
      });

      expect(client.webhookUrl).toBe("https://hooks.slack.com/test");
      expect(client.channel).toBe("#alerts");
      expect(client.maxRetries).toBe(2);
    });
  });

  describe("formatMessage", () => {
    it("should format message with all fields", () => {
      const message = formatMessage(baseOptions);

      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);
      expect(message.channel).toBeUndefined();

      // Check header block
      const headerBlock = message.blocks.find((b) => b.type === "header");
      expect(headerBlock?.text?.text).toBe("Documentation PR Created");

      // Check that blocks contain expected content
      const blocksJson = JSON.stringify(message.blocks);
      expect(blocksJson).toContain("docs: Update API documentation");
      expect(blocksJson).toContain("https://github.com/org/docs/pull/42");
      expect(blocksJson).toContain("org/api");
      expect(blocksJson).toContain("Updated API documentation");
    });

    it("should include channel when provided", () => {
      const message = formatMessage(baseOptions, "#docs-channel");

      expect(message.channel).toBe("#docs-channel");
    });

    it("should format files changed correctly when 5 or fewer", () => {
      const options: SlackNotificationOptions = {
        ...baseOptions,
        filesChanged: ["file1.md", "file2.md", "file3.md"],
      };

      const message = formatMessage(options);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).toContain("`file1.md`");
      expect(blocksJson).toContain("`file2.md`");
      expect(blocksJson).toContain("`file3.md`");
      expect(blocksJson).not.toContain("and");
      expect(blocksJson).not.toContain("more");
    });

    it("should truncate files list when more than 5 files", () => {
      const options: SlackNotificationOptions = {
        ...baseOptions,
        filesChanged: [
          "file1.md",
          "file2.md",
          "file3.md",
          "file4.md",
          "file5.md",
          "file6.md",
          "file7.md",
        ],
      };

      const message = formatMessage(options);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).toContain("`file1.md`");
      expect(blocksJson).toContain("`file5.md`");
      expect(blocksJson).toContain("and 2 more");
      expect(blocksJson).not.toContain("`file6.md`");
    });

    it("should handle empty files changed array", () => {
      const options: SlackNotificationOptions = {
        ...baseOptions,
        filesChanged: [],
      };

      const message = formatMessage(options);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).not.toContain("Files Changed");
    });

    it("should include reviewers when provided", () => {
      const message = formatMessage(baseOptions);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).toContain("Reviewers");
      expect(blocksJson).toContain("john-doe");
      expect(blocksJson).toContain("jane-smith");
    });

    it("should handle empty reviewers array", () => {
      const options: SlackNotificationOptions = {
        ...baseOptions,
        reviewers: [],
      };

      const message = formatMessage(options);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).not.toContain("Reviewers");
    });

    it("should include context block with timestamp", () => {
      const message = formatMessage(baseOptions);
      const contextBlock = message.blocks.find((b) => b.type === "context");

      expect(contextBlock).toBeDefined();
      expect(contextBlock?.elements?.[0]?.text).toContain("Generated by DocSync");
    });

    it("should include source PR details", () => {
      const message = formatMessage(baseOptions);
      const blocksJson = JSON.stringify(message.blocks);

      expect(blocksJson).toContain("#100 - feat: Add new endpoint");
      expect(blocksJson).toContain("https://github.com/org/api/pull/100");
    });
  });

  describe("sendNotification", () => {
    const client: SlackClient = {
      webhookUrl: "https://hooks.slack.com/test",
      maxRetries: 0, // No retries for faster tests
    };

    it("should send notification successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await sendNotification(client, baseOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
      );

      // Verify the body contains expected structure
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.blocks).toBeDefined();
      expect(Array.isArray(body.blocks)).toBe(true);
    });

    it("should include channel in request when configured", async () => {
      const clientWithChannel: SlackClient = {
        ...client,
        channel: "#docs-updates",
      };

      mockFetch.mockResolvedValueOnce({ ok: true });

      await sendNotification(clientWithChannel, baseOptions);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.channel).toBe("#docs-updates");
    });

    it("should throw SlackNotificationError on failed API call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("invalid_payload"),
      });

      await expect(sendNotification(client, baseOptions)).rejects.toThrow(
        SlackNotificationError
      );
    });

    it("should throw SlackNotificationError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(sendNotification(client, baseOptions)).rejects.toThrow(
        SlackNotificationError
      );
    });

    it("should include context in error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal error"),
      });

      try {
        await sendNotification(client, baseOptions);
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SlackNotificationError);
        const slackError = error as SlackNotificationError;
        expect(slackError.context?.docsPRNumber).toBe(42);
      }
    });

    it("should retry on retryable errors", async () => {
      const clientWithRetries: SlackClient = {
        webhookUrl: "https://hooks.slack.com/test",
        maxRetries: 2,
      };

      // Fail twice, then succeed
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        })
        .mockResolvedValueOnce({ ok: true });

      await sendNotification(clientWithRetries, baseOptions);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries exceeded", async () => {
      const clientWithRetries: SlackClient = {
        webhookUrl: "https://hooks.slack.com/test",
        maxRetries: 1,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        });

      await expect(
        sendNotification(clientWithRetries, baseOptions)
      ).rejects.toThrow(SlackNotificationError);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle rate limiting (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      });

      await expect(sendNotification(client, baseOptions)).rejects.toThrow(
        SlackNotificationError
      );
    });

  });

  describe("SlackNotificationError", () => {
    it("should be retryable", () => {
      const error = new SlackNotificationError("Test error");
      expect(error.retryable).toBe(true);
    });

    it("should have correct error code", () => {
      const error = new SlackNotificationError("Test error");
      expect(error.code).toBe("SLACK_NOTIFICATION_ERROR");
    });

    it("should include context when provided", () => {
      const error = new SlackNotificationError("Test error", {
        webhookUrl: "https://hooks.slack.com/test",
      });
      expect(error.context?.webhookUrl).toBe("https://hooks.slack.com/test");
    });
  });
});
