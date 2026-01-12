import simpleGit, { SimpleGit } from "simple-git";
import path from "path";
import os from "os";
import { GitOperationError, withRetry, logger } from "../errors/index.js";

export interface GitClientOptions {
  token: string;
  maxRetries?: number;
}

export interface CloneOptions {
  owner: string;
  repo: string;
  branch?: string;
}

export interface DiffResult {
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    patch: string;
  }>;
  summary: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
  };
}

export class GitClient {
  private token: string;
  private maxRetries: number;

  constructor(options: GitClientOptions) {
    this.token = options.token;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async clone(options: CloneOptions): Promise<{ path: string; git: SimpleGit }> {
    const { owner, repo, branch = "main" } = options;
    const clonePath = path.join(os.tmpdir(), `docsync-${owner}-${repo}-${Date.now()}`);
    const url = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;

    logger.info("Cloning repository", { owner, repo, branch });

    return withRetry(
      async () => {
        try {
          const git = simpleGit();
          await git.clone(url, clonePath, ["--branch", branch, "--single-branch"]);
          logger.info("Repository cloned successfully", { owner, repo, path: clonePath });
          return { path: clonePath, git: simpleGit(clonePath) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new GitOperationError(`Failed to clone repository: ${message}`, {
            owner,
            repo,
            branch,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async getDiff(
    git: SimpleGit,
    baseSha: string,
    headSha: string
  ): Promise<DiffResult> {
    logger.info("Getting diff", { baseSha, headSha });

    return withRetry(
      async () => {
        try {
          const diff = await git.diff([baseSha, headSha, "--stat"]);
          // Note: diffPatch can be used in future for full patch content
          await git.diff([baseSha, headSha]);

          const lines = diff.split("\n").filter((line) => line.trim());
          const files: DiffResult["files"] = [];

          for (const line of lines) {
            const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]+)/);
            if (match) {
              const [, filePath, _changes, indicators] = match;
              const additions = (indicators.match(/\+/g) || []).length;
              const deletions = (indicators.match(/-/g) || []).length;
              files.push({
                path: filePath.trim(),
                additions,
                deletions,
                patch: "",
              });
            }
          }

          const result = {
            files,
            summary: {
              totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
              totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
              filesChanged: files.length,
            },
          };

          logger.info("Diff retrieved successfully", { filesChanged: result.summary.filesChanged });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new GitOperationError(`Failed to get diff: ${message}`, {
            baseSha,
            headSha,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async readFile(git: SimpleGit, filePath: string, ref?: string): Promise<string> {
    return withRetry(
      async () => {
        try {
          if (ref) {
            return git.show([`${ref}:${filePath}`]);
          }
          const repoPath = (await git.revparse(["--show-toplevel"])).trim();
          const fs = await import("fs/promises");
          return fs.readFile(path.join(repoPath, filePath), "utf-8");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new GitOperationError(`Failed to read file: ${message}`, {
            filePath,
            ref,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async createBranch(git: SimpleGit, branchName: string): Promise<void> {
    logger.info("Creating branch", { branchName });

    return withRetry(
      async () => {
        try {
          await git.checkoutLocalBranch(branchName);
          logger.info("Branch created successfully", { branchName });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new GitOperationError(`Failed to create branch: ${message}`, {
            branchName,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async commitAndPush(
    git: SimpleGit,
    message: string,
    files: string[]
  ): Promise<void> {
    logger.info("Committing and pushing changes", { files, message });

    return withRetry(
      async () => {
        try {
          await git.add(files);
          await git.commit(message);
          await git.push(["--set-upstream", "origin", "HEAD"]);
          logger.info("Changes committed and pushed successfully");
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new GitOperationError(`Failed to commit and push: ${errorMessage}`, {
            files,
            message,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }
}
