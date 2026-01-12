import { GitClient } from "../index";

// Mock simple-git
jest.mock("simple-git", () => {
  const mockGit = {
    clone: jest.fn().mockResolvedValue(undefined),
    diff: jest.fn(),
    show: jest.fn(),
    revparse: jest.fn().mockResolvedValue("/tmp/repo\n"),
    checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
  };

  return jest.fn(() => mockGit);
});

describe("Git Module", () => {
  let gitClient: GitClient;

  beforeEach(() => {
    gitClient = new GitClient({ token: "test-token" });
    jest.clearAllMocks();
  });

  describe("GitClient constructor", () => {
    it("should create client with token", () => {
      const client = new GitClient({ token: "my-token" });
      expect(client).toBeInstanceOf(GitClient);
    });
  });

  describe("getDiff", () => {
    it("should parse git diff stat output correctly", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockImplementation((args: string[]) => {
        if (args.includes("--stat")) {
          return Promise.resolve(
            " src/index.ts | 10 +++++++---\n" +
            " src/utils.ts |  5 +++++\n" +
            " 2 files changed, 12 insertions(+), 3 deletions(-)"
          );
        }
        return Promise.resolve("diff patch content");
      });

      const result = await gitClient.getDiff(mockGit, "base123", "head456");

      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe("src/index.ts");
      expect(result.files[0].additions).toBe(7);
      expect(result.files[0].deletions).toBe(3);
      expect(result.files[1].path).toBe("src/utils.ts");
      expect(result.files[1].additions).toBe(5);
      expect(result.files[1].deletions).toBe(0);
    });

    it("should calculate summary correctly", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockImplementation((args: string[]) => {
        if (args.includes("--stat")) {
          return Promise.resolve(
            " file1.ts | 10 +++++-----\n" +
            " file2.ts | 20 ++++++++++++++++++++\n" +
            " file3.ts |  3 ---\n"
          );
        }
        return Promise.resolve("");
      });

      const result = await gitClient.getDiff(mockGit, "a", "b");

      expect(result.summary.filesChanged).toBe(3);
      expect(result.summary.totalAdditions).toBe(5 + 20 + 0);
      expect(result.summary.totalDeletions).toBe(5 + 0 + 3);
    });

    it("should handle empty diff", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockResolvedValue("");

      const result = await gitClient.getDiff(mockGit, "same", "same");

      expect(result.files).toHaveLength(0);
      expect(result.summary.filesChanged).toBe(0);
      expect(result.summary.totalAdditions).toBe(0);
      expect(result.summary.totalDeletions).toBe(0);
    });

    it("should handle files with only additions", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockImplementation((args: string[]) => {
        if (args.includes("--stat")) {
          return Promise.resolve(" new-file.ts | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++");
        }
        return Promise.resolve("");
      });

      const result = await gitClient.getDiff(mockGit, "a", "b");

      expect(result.files[0].additions).toBe(50);
      expect(result.files[0].deletions).toBe(0);
    });

    it("should handle files with only deletions", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockImplementation((args: string[]) => {
        if (args.includes("--stat")) {
          return Promise.resolve(" deleted-code.ts | 30 ------------------------------");
        }
        return Promise.resolve("");
      });

      const result = await gitClient.getDiff(mockGit, "a", "b");

      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(30);
    });

    it("should call git diff with correct arguments", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.diff.mockResolvedValue("");

      await gitClient.getDiff(mockGit, "base-sha", "head-sha");

      expect(mockGit.diff).toHaveBeenCalledWith(["base-sha", "head-sha", "--stat"]);
      expect(mockGit.diff).toHaveBeenCalledWith(["base-sha", "head-sha"]);
    });
  });

  describe("readFile", () => {
    it("should read file at specific ref using git show", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      mockGit.show.mockResolvedValue("file content at ref");

      const result = await gitClient.readFile(mockGit, "src/index.ts", "abc123");

      expect(mockGit.show).toHaveBeenCalledWith(["abc123:src/index.ts"]);
      expect(result).toBe("file content at ref");
    });
  });

  describe("createBranch", () => {
    it("should create and checkout local branch", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      await gitClient.createBranch(mockGit, "feature/new-branch");

      expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith("feature/new-branch");
    });
  });

  describe("commitAndPush", () => {
    it("should add files, commit, and push", async () => {
      const simpleGit = require("simple-git");
      const mockGit = simpleGit();

      await gitClient.commitAndPush(mockGit, "commit message", ["file1.ts", "file2.ts"]);

      expect(mockGit.add).toHaveBeenCalledWith(["file1.ts", "file2.ts"]);
      expect(mockGit.commit).toHaveBeenCalledWith("commit message");
      expect(mockGit.push).toHaveBeenCalledWith(["--set-upstream", "origin", "HEAD"]);
    });
  });
});
