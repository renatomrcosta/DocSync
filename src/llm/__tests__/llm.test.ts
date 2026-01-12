import { createLLMClient, CodeAnalysis } from "../index";

// Mock the Anthropic SDK
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

describe("LLM Module", () => {
  describe("createLLMClient", () => {
    it("should create Anthropic client when provider is anthropic", () => {
      const client = createLLMClient({
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-20250514",
      });

      expect(client).toBeDefined();
      expect(client.analyzeCode).toBeDefined();
      expect(client.generateDocumentation).toBeDefined();
      expect(client.generateDiagram).toBeDefined();
    });

    it("should throw error for unsupported provider", () => {
      expect(() =>
        createLLMClient({
          provider: "openai" as any,
          apiKey: "test-key",
          model: "gpt-4",
        })
      ).toThrow("Unsupported LLM provider: openai");
    });
  });

  describe("AnthropicClient", () => {
    let client: ReturnType<typeof createLLMClient>;
    let mockCreate: jest.Mock;

    beforeEach(() => {
      const Anthropic = require("@anthropic-ai/sdk");
      mockCreate = jest.fn();
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      client = createLLMClient({
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-4-20250514",
      });
    });

    describe("analyzeCode", () => {
      it("should call Anthropic API with correct parameters", async () => {
        const mockAnalysis: CodeAnalysis = {
          summary: "Added new feature",
          changes: [
            {
              type: "added",
              component: "UserService",
              description: "New user authentication",
              impact: "high",
            },
          ],
          architecturalChanges: true,
          suggestedDiagrams: ["context", "container"],
        };

        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify(mockAnalysis) }],
        });

        const result = await client.analyzeCode("diff content", "context info");

        expect(mockCreate).toHaveBeenCalledWith({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: expect.stringContaining("diff content"),
            },
          ],
        });
        expect(result).toEqual(mockAnalysis);
      });

      it("should include context in prompt when provided", async () => {
        mockCreate.mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "test",
                changes: [],
                architecturalChanges: false,
                suggestedDiagrams: [],
              }),
            },
          ],
        });

        await client.analyzeCode("diff", "existing context");

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain("Context:");
        expect(callArgs.messages[0].content).toContain("existing context");
      });

      it("should throw error for non-text response", async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: "image", data: "..." }],
        });

        await expect(client.analyzeCode("diff")).rejects.toThrow(
          "Unexpected response type"
        );
      });

      it("should parse valid JSON response", async () => {
        const analysis: CodeAnalysis = {
          summary: "Refactored code",
          changes: [
            {
              type: "modified",
              component: "Database",
              description: "Updated queries",
              impact: "medium",
            },
          ],
          architecturalChanges: false,
          suggestedDiagrams: ["component"],
        };

        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify(analysis) }],
        });

        const result = await client.analyzeCode("diff");

        expect(result.summary).toBe("Refactored code");
        expect(result.changes).toHaveLength(1);
        expect(result.changes[0].type).toBe("modified");
        expect(result.architecturalChanges).toBe(false);
        expect(result.suggestedDiagrams).toContain("component");
      });
    });

    describe("generateDocumentation", () => {
      it("should call API with analysis and template", async () => {
        const analysis: CodeAnalysis = {
          summary: "Test summary",
          changes: [],
          architecturalChanges: false,
          suggestedDiagrams: [],
        };
        const template = "# {{title}}\n{{summary}}";

        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: "# Generated Doc\nTest summary" }],
        });

        const result = await client.generateDocumentation(analysis, template);

        expect(mockCreate).toHaveBeenCalled();
        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain(JSON.stringify(analysis, null, 2));
        expect(callArgs.messages[0].content).toContain(template);
        expect(result).toBe("# Generated Doc\nTest summary");
      });

      it("should throw error for non-text response", async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: "tool_use", id: "123" }],
        });

        await expect(
          client.generateDocumentation(
            { summary: "", changes: [], architecturalChanges: false, suggestedDiagrams: [] },
            ""
          )
        ).rejects.toThrow("Unexpected response type");
      });
    });

    describe("generateDiagram", () => {
      it("should generate context diagram", async () => {
        const analysis: CodeAnalysis = {
          summary: "New service added",
          changes: [
            {
              type: "added",
              component: "PaymentService",
              description: "Payment processing",
              impact: "high",
            },
          ],
          architecturalChanges: true,
          suggestedDiagrams: ["context"],
        };

        const mermaidOutput = `\`\`\`mermaid
C4Context
    title Payment System Context
    Person(user, "User")
    System(payment, "Payment Service")
\`\`\``;

        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: mermaidOutput }],
        });

        const result = await client.generateDiagram(analysis, "context");

        expect(mockCreate).toHaveBeenCalled();
        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain("context");
        expect(callArgs.messages[0].content).toContain("C4");
        expect(result).toBe(mermaidOutput);
      });

      it("should generate container diagram", async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: "container diagram" }],
        });

        const result = await client.generateDiagram(
          { summary: "", changes: [], architecturalChanges: false, suggestedDiagrams: [] },
          "container"
        );

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain("container");
        expect(result).toBe("container diagram");
      });

      it("should generate component diagram", async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: "text", text: "component diagram" }],
        });

        const result = await client.generateDiagram(
          { summary: "", changes: [], architecturalChanges: false, suggestedDiagrams: [] },
          "component"
        );

        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.messages[0].content).toContain("component");
        expect(result).toBe("component diagram");
      });

      it("should throw error for non-text response", async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: "image" }],
        });

        await expect(
          client.generateDiagram(
            { summary: "", changes: [], architecturalChanges: false, suggestedDiagrams: [] },
            "context"
          )
        ).rejects.toThrow("Unexpected response type");
      });
    });
  });
});
