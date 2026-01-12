import express, { Request, Response, Router } from "express";
import crypto from "crypto";

export interface PullRequestEvent {
  action: string;
  pullRequest: {
    number: number;
    title: string;
    merged: boolean;
    mergedBy: string;
    author: string;
    base: {
      ref: string;
      sha: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    diffUrl: string;
  };
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
}

export type WebhookHandler = (event: PullRequestEvent) => Promise<void>;

export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = `sha256=${hmac.update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export function createWebhookRouter(
  secret: string,
  handler: WebhookHandler
): Router {
  const router = Router();

  router.post("/webhook", express.json(), async (req: Request, res: Response) => {
    const signature = req.headers["x-hub-signature-256"] as string;

    if (!signature) {
      res.status(401).json({ error: "Missing signature" });
      return;
    }

    const payload = JSON.stringify(req.body);
    if (!verifySignature(payload, signature, secret)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const eventType = req.headers["x-github-event"] as string;
    if (eventType !== "pull_request") {
      res.status(200).json({ message: "Event ignored" });
      return;
    }

    const body = req.body;
    if (body.action !== "closed" || !body.pull_request?.merged) {
      res.status(200).json({ message: "Not a merged PR" });
      return;
    }

    const event: PullRequestEvent = {
      action: body.action,
      pullRequest: {
        number: body.pull_request.number,
        title: body.pull_request.title,
        merged: body.pull_request.merged,
        mergedBy: body.pull_request.merged_by?.login || "",
        author: body.pull_request.user?.login || "",
        base: {
          ref: body.pull_request.base.ref,
          sha: body.pull_request.base.sha,
        },
        head: {
          ref: body.pull_request.head.ref,
          sha: body.pull_request.head.sha,
        },
        diffUrl: body.pull_request.diff_url,
      },
      repository: {
        owner: body.repository.owner.login,
        name: body.repository.name,
        fullName: body.repository.full_name,
      },
    };

    try {
      await handler(event);
      res.status(200).json({ message: "Processed" });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  return router;
}
