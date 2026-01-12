import { templates, generateFilename, renderTemplate } from "../index";
import type { CodeAnalysis } from "../../llm/index";

describe("Docs Module", () => {
  describe("templates", () => {
    it("should have changeSummary template", () => {
      expect(templates.changeSummary).toBeDefined();
      expect(templates.changeSummary.name).toBe("Change Summary");
      expect(templates.changeSummary.content).toContain("{{title}}");
      expect(templates.changeSummary.content).toContain("{{summary}}");
    });

    it("should have apiDocumentation template", () => {
      expect(templates.apiDocumentation).toBeDefined();
      expect(templates.apiDocumentation.name).toBe("API Documentation");
      expect(templates.apiDocumentation.content).toContain("{{component}}");
    });

    it("should have architectureUpdate template", () => {
      expect(templates.architectureUpdate).toBeDefined();
      expect(templates.architectureUpdate.name).toBe("Architecture Update");
      expect(templates.architectureUpdate.content).toContain("{{diagram}}");
    });
  });

  describe("generateFilename", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-15"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should generate filename with date, PR number, template, and slug", () => {
      const analysis: CodeAnalysis = {
        summary: "Add user authentication",
        changes: [],
        architecturalChanges: false,
        suggestedDiagrams: [],
      };

      const filename = generateFilename(analysis, 42, "change-summary");

      expect(filename).toBe("2024-01-15-pr-42-change-summary-add-user-authentication.md");
    });

    it("should truncate long summaries to 50 characters", () => {
      const analysis: CodeAnalysis = {
        summary: "This is a very long summary that should be truncated because it exceeds fifty characters",
        changes: [],
        architecturalChanges: false,
        suggestedDiagrams: [],
      };

      const filename = generateFilename(analysis, 100, "api-docs");
      // The filename format is: ${date}-pr-${prNumber}-${template}-${slug}.md
      // Extract the slug by removing the known prefix and .md suffix
      const prefix = "2024-01-15-pr-100-api-docs-";
      const slug = filename.replace(prefix, "").replace(".md", "");

      expect(slug.length).toBeLessThanOrEqual(50);
    });

    it("should sanitize special characters in slug", () => {
      const analysis: CodeAnalysis = {
        summary: "Fix: API endpoint #123 (critical!)",
        changes: [],
        architecturalChanges: false,
        suggestedDiagrams: [],
      };

      const filename = generateFilename(analysis, 5, "fix");

      expect(filename).not.toContain(":");
      expect(filename).not.toContain("#");
      expect(filename).not.toContain("(");
      expect(filename).not.toContain("!");
      expect(filename).toMatch(/^[\w-]+\.md$/);
    });

    it("should convert summary to lowercase", () => {
      const analysis: CodeAnalysis = {
        summary: "ADD NEW FEATURE",
        changes: [],
        architecturalChanges: false,
        suggestedDiagrams: [],
      };

      const filename = generateFilename(analysis, 1, "feature");

      expect(filename).toBe("2024-01-15-pr-1-feature-add-new-feature.md");
    });
  });

  describe("renderTemplate", () => {
    it("should replace single placeholder", () => {
      const template = "Hello, {{name}}!";
      const result = renderTemplate(template, { name: "World" });

      expect(result).toBe("Hello, World!");
    });

    it("should replace multiple placeholders", () => {
      const template = "{{greeting}}, {{name}}! Today is {{day}}.";
      const result = renderTemplate(template, {
        greeting: "Hello",
        name: "User",
        day: "Monday",
      });

      expect(result).toBe("Hello, User! Today is Monday.");
    });

    it("should replace repeated placeholders", () => {
      const template = "{{name}} says: Hello, {{name}}!";
      const result = renderTemplate(template, { name: "Bob" });

      expect(result).toBe("Bob says: Hello, Bob!");
    });

    it("should handle placeholders not in data", () => {
      const template = "Hello, {{name}}! Your role is {{role}}.";
      const result = renderTemplate(template, { name: "Alice" });

      expect(result).toBe("Hello, Alice! Your role is {{role}}.");
    });

    it("should convert non-string values to strings", () => {
      const template = "Count: {{count}}, Active: {{active}}";
      const result = renderTemplate(template, { count: 42, active: true });

      expect(result).toBe("Count: 42, Active: true");
    });

    it("should handle empty data object", () => {
      const template = "Static content only";
      const result = renderTemplate(template, {});

      expect(result).toBe("Static content only");
    });

    it("should render changeSummary template correctly", () => {
      const result = renderTemplate(templates.changeSummary.content, {
        title: "Test PR",
        date: "2024-01-15",
        prNumber: 42,
        author: "testuser",
        summary: "Added new feature",
        prUrl: "https://github.com/owner/repo/pull/42",
      });

      expect(result).toContain("title: Test PR");
      expect(result).toContain("date: 2024-01-15");
      expect(result).toContain("pr: 42");
      expect(result).toContain("author: testuser");
      expect(result).toContain("Added new feature");
      expect(result).toContain("[Source PR](https://github.com/owner/repo/pull/42)");
    });
  });
});
