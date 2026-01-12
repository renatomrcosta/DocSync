import express from "express";
import { loadConfig } from "./config/index.js";
import { createWebhookRouter, PullRequestEvent } from "./webhook/index.js";
import { GitClient } from "./git/index.js";
import { createLLMClient } from "./llm/index.js";
import { templates, generateFilename, renderTemplate } from "./docs/index.js";
import { createGitHubClient, createPullRequest, generatePRDescription } from "./pr/index.js";

async function main() {
  const config = loadConfig();

  const gitClient = new GitClient({ token: config.github.token });
  const llmClient = createLLMClient(config.llm);
  const githubClient = createGitHubClient(config.github.token);

  const handleWebhook = async (event: PullRequestEvent) => {
    console.log(`Processing PR #${event.pullRequest.number} from ${event.repository.fullName}`);

    const { git } = await gitClient.clone({
      owner: event.repository.owner,
      repo: event.repository.name,
    });

    const diff = await gitClient.getDiff(
      git,
      event.pullRequest.base.sha,
      event.pullRequest.head.sha
    );

    const analysis = await llmClient.analyzeCode(
      diff.files.map((f) => f.patch).join("\n")
    );

    const docContent = renderTemplate(templates.changeSummary.content, {
      title: event.pullRequest.title,
      date: new Date().toISOString(),
      prNumber: event.pullRequest.number,
      author: event.pullRequest.author,
      summary: analysis.summary,
      prUrl: `https://github.com/${event.repository.fullName}/pull/${event.pullRequest.number}`,
    });

    const filename = generateFilename(
      analysis,
      event.pullRequest.number,
      "change-summary"
    );

    const { git: docsGit } = await gitClient.clone({
      owner: config.docsRepository.owner,
      repo: config.docsRepository.repo,
    });

    const branchName = `docs/pr-${event.pullRequest.number}`;
    await gitClient.createBranch(docsGit, branchName);

    const fs = await import("fs/promises");
    const path = await import("path");
    const repoPath = (await docsGit.revparse(["--show-toplevel"])).trim();
    await fs.writeFile(path.join(repoPath, "docs", filename), docContent);

    await gitClient.commitAndPush(docsGit, `docs: add documentation for PR #${event.pullRequest.number}`, [
      `docs/${filename}`,
    ]);

    const pr = await createPullRequest(githubClient, {
      owner: config.docsRepository.owner,
      repo: config.docsRepository.repo,
      title: `docs: Update documentation for PR #${event.pullRequest.number}`,
      body: generatePRDescription(
        {
          number: event.pullRequest.number,
          title: event.pullRequest.title,
          url: `https://github.com/${event.repository.fullName}/pull/${event.pullRequest.number}`,
        },
        [filename],
        analysis.summary
      ),
      head: branchName,
      base: config.docsRepository.branch,
      reviewers: [event.pullRequest.author],
    });

    console.log(`Created documentation PR: ${pr.url}`);
  };

  const app = express();
  app.use(createWebhookRouter(config.webhookSecret, handleWebhook));

  app.get("/health", (_, res) => {
    res.json({ status: "ok" });
  });

  app.listen(config.port, () => {
    console.log(`DocSync server running on port ${config.port}`);
  });
}

main().catch(console.error);
