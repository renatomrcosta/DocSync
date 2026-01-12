import {
  createGitHubClient,
  createPullRequest,
  addReviewers,
  generatePRDescription,
  GitHubAPIClient,
} from "../index";
import { PRCreationError } from "../../errors/index";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console for logger
jest.spyOn(console, "info").mockImplementation();
jest.spyOn(console, "warn").mockImplementation();
jest.spyOn(console, "error").mockImplementation();

describe("PR Module", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("createGitHubClient", () => {
    it("should create client with token and default base URL", () => {
      const client = createGitHubClient("test-token");

      expect(client.token).toBe("test-token");
      expect(client.baseUrl).toBe("https://api.github.com");
      expect(client.maxRetries).toBe(3);
    });

    it("should create client with custom maxRetries", () => {
      const client = createGitHubClient("test-token", 5);

      expect(client.maxRetries).toBe(5);
    });
  });

  describe("createPullRequest", () => {
    const client: GitHubAPIClient = {
      token: "test-token",
      baseUrl: "https://api.github.com",
      maxRetries: 0, // No retries for tests
    };

    it("should create PR with correct API call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            number: 123,
            html_url: "https://github.com/owner/repo/pull/123",
            title: "Test PR",
          }),
      });

      const result = await createPullRequest(client, {
        owner: "owner",
        repo: "repo",
        title: "Test PR",
        body: "PR body",
        head: "feature-branch",
        base: "main",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Test PR",
            body: "PR body",
            head: "feature-branch",
            base: "main",
          }),
        }
      );

      expect(result.number).toBe(123);
      expect(result.url).toBe("https://github.com/owner/repo/pull/123");
      expect(result.title).toBe("Test PR");
    });

    it("should throw PRCreationError on failed API call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Validation Failed"),
      });

      await expect(
        createPullRequest(client, {
          owner: "owner",
          repo: "repo",
          title: "Test",
          body: "Body",
          head: "head",
          base: "base",
        })
      ).rejects.toThrow(PRCreationError);
    });

    it("should add reviewers when provided", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              number: 456,
              html_url: "https://github.com/owner/repo/pull/456",
              title: "PR with reviewers",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
        });

      await createPullRequest(client, {
        owner: "owner",
        repo: "repo",
        title: "PR with reviewers",
        body: "Body",
        head: "head",
        base: "base",
        reviewers: ["reviewer1", "reviewer2"],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://api.github.com/repos/owner/repo/pulls/456/requested_reviewers",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reviewers: ["reviewer1", "reviewer2"] }),
        })
      );
    });

    it("should not add reviewers when empty array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            number: 789,
            html_url: "https://github.com/owner/repo/pull/789",
            title: "No reviewers",
          }),
      });

      await createPullRequest(client, {
        owner: "owner",
        repo: "repo",
        title: "No reviewers",
        body: "Body",
        head: "head",
        base: "base",
        reviewers: [],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("addReviewers", () => {
    const client: GitHubAPIClient = {
      token: "test-token",
      baseUrl: "https://api.github.com",
      maxRetries: 0,
    };

    it("should call API with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await addReviewers(client, "owner", "repo", 42, ["user1", "user2"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/42/requested_reviewers",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reviewers: ["user1", "user2"] }),
        }
      );
    });

    it("should throw PRCreationError on failed API call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("User not found"),
      });

      await expect(
        addReviewers(client, "owner", "repo", 42, ["nonexistent"])
      ).rejects.toThrow(PRCreationError);
    });
  });

  describe("generatePRDescription", () => {
    it("should generate description with all fields", () => {
      const sourcePR = {
        number: 100,
        title: "Add feature X",
        url: "https://github.com/owner/repo/pull/100",
      };
      const filesChanged = ["docs/feature-x.md", "diagrams/context.md"];
      const summary = "Documentation for the new feature X";

      const result = generatePRDescription(sourcePR, filesChanged, summary);

      expect(result).toContain("## Documentation Update");
      expect(result).toContain("[PR #100](https://github.com/owner/repo/pull/100)");
      expect(result).toContain("Documentation for the new feature X");
      expect(result).toContain("- `docs/feature-x.md`");
      expect(result).toContain("- `diagrams/context.md`");
      expect(result).toContain("[#100 - Add feature X]");
      expect(result).toContain("*Generated by DocSync*");
    });

    it("should handle single file changed", () => {
      const result = generatePRDescription(
        { number: 1, title: "Fix", url: "https://example.com/1" },
        ["single-file.md"],
        "Summary"
      );

      expect(result).toContain("- `single-file.md`");
      expect(result.match(/- `/g)?.length).toBe(1);
    });

    it("should handle multiple files", () => {
      const result = generatePRDescription(
        { number: 1, title: "Update", url: "https://example.com/1" },
        ["file1.md", "file2.md", "file3.md"],
        "Multiple files updated"
      );

      expect(result).toContain("- `file1.md`");
      expect(result).toContain("- `file2.md`");
      expect(result).toContain("- `file3.md`");
    });

    it("should include source PR link in description", () => {
      const result = generatePRDescription(
        {
          number: 42,
          title: "Important change",
          url: "https://github.com/org/project/pull/42",
        },
        ["docs.md"],
        "Test"
      );

      expect(result).toContain("**Source PR**");
      expect(result).toContain(
        "[#42 - Important change](https://github.com/org/project/pull/42)"
      );
    });
  });
});
