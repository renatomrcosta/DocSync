import { z } from "zod";

const ConfigSchema = z.object({
  port: z.number().default(3000),
  webhookSecret: z.string(),
  github: z.object({
    token: z.string(),
    appId: z.string().optional(),
    privateKey: z.string().optional(),
  }),
  llm: z.object({
    provider: z.enum(["anthropic", "openai"]).default("anthropic"),
    apiKey: z.string(),
    model: z.string().default("claude-sonnet-4-20250514"),
  }),
  docsRepository: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string().default("main"),
  }),
  slack: z
    .object({
      webhookUrl: z.string(),
      channel: z.string().optional(),
      enabled: z.boolean().default(false),
    })
    .optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const config = ConfigSchema.parse({
    port: parseInt(process.env.PORT || "3000", 10),
    webhookSecret: process.env.WEBHOOK_SECRET,
    github: {
      token: process.env.GITHUB_TOKEN,
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
    },
    llm: {
      provider: process.env.LLM_PROVIDER || "anthropic",
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
    },
    docsRepository: {
      owner: process.env.DOCS_REPO_OWNER,
      repo: process.env.DOCS_REPO_NAME,
      branch: process.env.DOCS_REPO_BRANCH || "main",
    },
    slack: process.env.SLACK_WEBHOOK_URL
      ? {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL,
          enabled: process.env.SLACK_ENABLED === "true",
        }
      : undefined,
  });

  return config;
}
