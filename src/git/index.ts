import simpleGit, { SimpleGit } from "simple-git";
import path from "path";
import os from "os";

export interface GitClientOptions {
  token: string;
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

  constructor(options: GitClientOptions) {
    this.token = options.token;
  }

  async clone(options: CloneOptions): Promise<{ path: string; git: SimpleGit }> {
    const { owner, repo, branch = "main" } = options;
    const clonePath = path.join(os.tmpdir(), `docsync-${owner}-${repo}-${Date.now()}`);
    const url = `https://x-access-token:${this.token}@github.com/${owner}/${repo}.git`;

    const git = simpleGit();
    await git.clone(url, clonePath, ["--branch", branch, "--single-branch"]);

    return { path: clonePath, git: simpleGit(clonePath) };
  }

  async getDiff(
    git: SimpleGit,
    baseSha: string,
    headSha: string
  ): Promise<DiffResult> {
    const diff = await git.diff([baseSha, headSha, "--stat"]);
    const diffPatch = await git.diff([baseSha, headSha]);

    const lines = diff.split("\n").filter((line) => line.trim());
    const files: DiffResult["files"] = [];

    for (const line of lines) {
      const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]+)/);
      if (match) {
        const [, filePath, changes, indicators] = match;
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

    return {
      files,
      summary: {
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
        filesChanged: files.length,
      },
    };
  }

  async readFile(git: SimpleGit, filePath: string, ref?: string): Promise<string> {
    if (ref) {
      return git.show([`${ref}:${filePath}`]);
    }
    const repoPath = (await git.revparse(["--show-toplevel"])).trim();
    const fs = await import("fs/promises");
    return fs.readFile(path.join(repoPath, filePath), "utf-8");
  }

  async createBranch(git: SimpleGit, branchName: string): Promise<void> {
    await git.checkoutLocalBranch(branchName);
  }

  async commitAndPush(
    git: SimpleGit,
    message: string,
    files: string[]
  ): Promise<void> {
    await git.add(files);
    await git.commit(message);
    await git.push(["--set-upstream", "origin", "HEAD"]);
  }
}
