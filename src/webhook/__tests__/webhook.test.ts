import crypto from "crypto";
import express from "express";
import request from "supertest";
import { verifySignature, createWebhookRouter, PullRequestEvent } from "../index";

describe("Webhook Module", () => {
  describe("verifySignature", () => {
    const secret = "test-secret";

    it("should return true for valid signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const hmac = crypto.createHmac("sha256", secret);
      const signature = `sha256=${hmac.update(payload).digest("hex")}`;

      expect(verifySignature(payload, signature, secret)).toBe(true);
    });

    it("should return false for invalid signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const invalidSignature = "sha256=invalid_signature_here_1234567890abcdef";

      expect(verifySignature(payload, invalidSignature, secret)).toBe(false);
    });

    it("should return false for tampered payload", () => {
      const originalPayload = JSON.stringify({ test: "data" });
      const tamperedPayload = JSON.stringify({ test: "tampered" });
      const hmac = crypto.createHmac("sha256", secret);
      const signature = `sha256=${hmac.update(originalPayload).digest("hex")}`;

      expect(verifySignature(tamperedPayload, signature, secret)).toBe(false);
    });

    it("should return false for wrong secret", () => {
      const payload = JSON.stringify({ test: "data" });
      const hmac = crypto.createHmac("sha256", secret);
      const signature = `sha256=${hmac.update(payload).digest("hex")}`;

      expect(verifySignature(payload, signature, "wrong-secret")).toBe(false);
    });
  });

  describe("createWebhookRouter", () => {
    const secret = "webhook-secret";
    let app: express.Application;
    let mockHandler: jest.Mock;

    function createSignature(payload: string): string {
      const hmac = crypto.createHmac("sha256", secret);
      return `sha256=${hmac.update(payload).digest("hex")}`;
    }

    beforeEach(() => {
      mockHandler = jest.fn().mockResolvedValue(undefined);
      app = express();
      app.use(createWebhookRouter(secret, mockHandler));
    });

    it("should reject requests without signature", async () => {
      const response = await request(app)
        .post("/webhook")
        .send({ test: "data" })
        .set("Content-Type", "application/json");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Missing signature");
    });

    it("should reject requests with invalid signature", async () => {
      const response = await request(app)
        .post("/webhook")
        .send({ test: "data" })
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", "sha256=invalid");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should ignore non-pull_request events", async () => {
      const payload = { test: "data" };
      const payloadString = JSON.stringify(payload);

      const response = await request(app)
        .post("/webhook")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", createSignature(payloadString))
        .set("x-github-event", "push");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Event ignored");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should ignore non-merged PRs", async () => {
      const payload = {
        action: "opened",
        pull_request: { merged: false },
      };
      const payloadString = JSON.stringify(payload);

      const response = await request(app)
        .post("/webhook")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", createSignature(payloadString))
        .set("x-github-event", "pull_request");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Not a merged PR");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should process merged PRs and call handler", async () => {
      const payload = {
        action: "closed",
        pull_request: {
          number: 42,
          title: "Test PR",
          merged: true,
          merged_by: { login: "merger" },
          user: { login: "author" },
          base: { ref: "main", sha: "base123" },
          head: { ref: "feature", sha: "head456" },
          diff_url: "https://github.com/owner/repo/pull/42.diff",
        },
        repository: {
          owner: { login: "owner" },
          name: "repo",
          full_name: "owner/repo",
        },
      };
      const payloadString = JSON.stringify(payload);

      const response = await request(app)
        .post("/webhook")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", createSignature(payloadString))
        .set("x-github-event", "pull_request");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Processed");
      expect(mockHandler).toHaveBeenCalledTimes(1);

      const event: PullRequestEvent = mockHandler.mock.calls[0][0];
      expect(event.pullRequest.number).toBe(42);
      expect(event.pullRequest.author).toBe("author");
      expect(event.repository.fullName).toBe("owner/repo");
    });

    it("should return 500 if handler throws", async () => {
      mockHandler.mockRejectedValue(new Error("Handler error"));

      const payload = {
        action: "closed",
        pull_request: {
          number: 42,
          title: "Test PR",
          merged: true,
          merged_by: { login: "merger" },
          user: { login: "author" },
          base: { ref: "main", sha: "base123" },
          head: { ref: "feature", sha: "head456" },
          diff_url: "https://github.com/owner/repo/pull/42.diff",
        },
        repository: {
          owner: { login: "owner" },
          name: "repo",
          full_name: "owner/repo",
        },
      };
      const payloadString = JSON.stringify(payload);

      const response = await request(app)
        .post("/webhook")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", createSignature(payloadString))
        .set("x-github-event", "pull_request");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Processing failed");
    });
  });
});
