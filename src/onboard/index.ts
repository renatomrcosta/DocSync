import { Router, Request, Response, json } from "express";
import { z } from "zod";
import { GitClient } from "../git/index.js";
import { LLMClient, CodebaseAnalysis } from "../llm/index.js";
import { generateProjectDocumentation, generateC4Diagrams } from "../docs/index.js";
import { createPullRequest, GitHubAPIClient } from "../pr/index.js";
import { logger } from "../errors/index.js";
import path from "path";
import fs from "fs/promises";

const OnboardRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().optional(),
});

export interface OnboardOptions {
  gitClient: GitClient;
  llmClient: LLMClient;
  githubClient: GitHubAPIClient;
  docsRepository: {
    owner: string;
    repo: string;
    branch: string;
  };
}

export function createOnboardRouter(options: OnboardOptions): Router {
  const router = Router();
  router.use(json());

  router.post("/onboard", async (req: Request, res: Response) => {
    try {
      const parsed = OnboardRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues,
        });
        return;
      }

      const { owner, repo, branch } = parsed.data;
      logger.info("Starting repository onboarding", { owner, repo, branch });

      // Clone the source repository
      const { path: sourcePath } = await options.gitClient.clone({
        owner,
        repo,
        branch,
      });

      // Read the codebase structure
      const codebaseContent = await readCodebaseContent(sourcePath);

      // Analyze the full codebase with LLM
      const analysis = await options.llmClient.analyzeCodebase(codebaseContent, {
        owner,
        repo,
      });

      // Generate comprehensive documentation
      const documentation = generateProjectDocumentation(analysis, {
        owner,
        repo,
        branch: branch || "main",
      });

      // Generate C4 diagrams
      const diagrams = await generateC4Diagrams(options.llmClient, analysis);

      // Combine documentation with diagrams
      const fullDocumentation = combineDocumentationWithDiagrams(documentation, diagrams);

      // Clone docs repository
      const { git: docsGit, path: docsPath } = await options.gitClient.clone({
        owner: options.docsRepository.owner,
        repo: options.docsRepository.repo,
        branch: options.docsRepository.branch,
      });

      // Create branch for the documentation
      const branchName = `docs/onboard-${owner}-${repo}`;
      await options.gitClient.createBranch(docsGit, branchName);

      // Write documentation file
      const docFilename = `${repo}.md`;
      const docsDir = path.join(docsPath, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      await fs.writeFile(path.join(docsDir, docFilename), fullDocumentation);

      // Commit and push
      await options.gitClient.commitAndPush(
        docsGit,
        `docs: Add initial documentation for ${owner}/${repo}`,
        [`docs/${docFilename}`]
      );

      // Create PR
      const pr = await createPullRequest(options.githubClient, {
        owner: options.docsRepository.owner,
        repo: options.docsRepository.repo,
        title: `docs: Add documentation for ${owner}/${repo}`,
        body: generateOnboardingPRDescription(owner, repo, analysis),
        head: branchName,
        base: options.docsRepository.branch,
        reviewers: [],
      });

      logger.info("Repository onboarding completed", {
        owner,
        repo,
        prUrl: pr.url,
      });

      res.status(201).json({
        success: true,
        message: "Repository onboarded successfully",
        prUrl: pr.url,
        documentationFile: docFilename,
      });
    } catch (error) {
      logger.error("Failed to onboard repository", { error });
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: "Failed to onboard repository",
        message,
      });
    }
  });

  return router;
}

async function readCodebaseContent(repoPath: string): Promise<string> {
  const relevantExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
    ".json", ".yaml", ".yml", ".md", ".toml",
  ];
  const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

  const files: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name)) {
          await walkDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (relevantExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walkDir(repoPath);

  // Read file contents with size limit
  const contents: string[] = [];
  let totalSize = 0;
  const maxSize = 100000; // 100KB limit for LLM context

  for (const file of files) {
    if (totalSize >= maxSize) break;

    try {
      const relativePath = path.relative(repoPath, file);
      const content = await fs.readFile(file, "utf-8");
      const snippet = content.slice(0, 2000); // First 2000 chars per file
      contents.push(`--- ${relativePath} ---\n${snippet}`);
      totalSize += snippet.length;
    } catch {
      // Skip files that can't be read
    }
  }

  return contents.join("\n\n");
}

function combineDocumentationWithDiagrams(
  documentation: string,
  diagrams: { context: string; container: string; component: string }
): string {
  const diagramsSection = `
## Architecture Diagrams

### System Context

${diagrams.context}

### Container Diagram

${diagrams.container}

### Component Diagram

${diagrams.component}
`;

  // Insert diagrams after the overview section
  const overviewEnd = documentation.indexOf("## ");
  if (overviewEnd > 0) {
    const secondSectionStart = documentation.indexOf("## ", overviewEnd + 3);
    if (secondSectionStart > 0) {
      return (
        documentation.slice(0, secondSectionStart) +
        diagramsSection +
        "\n" +
        documentation.slice(secondSectionStart)
      );
    }
  }

  // Fallback: append at the end
  return documentation + "\n" + diagramsSection;
}

function generateOnboardingPRDescription(
  owner: string,
  repo: string,
  analysis: CodebaseAnalysis
): string {
  return `## Summary

Initial documentation generated for **${owner}/${repo}**.

This PR contains:
- Comprehensive project documentation
- C4 architecture diagrams (Context, Container, Component)
- Project overview and structure
- Key components and their responsibilities

## Project Analysis

${analysis.summary}

## Key Components

${analysis.components.map((c) => `- **${c.name}**: ${c.description}`).join("\n")}

## Next Steps

1. Review the generated documentation for accuracy
2. Update any sections that need more detail
3. Merge to make the documentation available

---
🤖 Generated with [DocSync](https://github.com/your-org/docsync)
`;
}
