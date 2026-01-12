import Anthropic from "@anthropic-ai/sdk";
import { LLMError, withRetry, logger } from "../errors/index.js";

export interface LLMClientOptions {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxRetries?: number;
}

export interface CodeAnalysis {
  summary: string;
  changes: Array<{
    type: "added" | "modified" | "deleted";
    component: string;
    description: string;
    impact: "high" | "medium" | "low";
  }>;
  architecturalChanges: boolean;
  suggestedDiagrams: Array<"context" | "container" | "component">;
}

export interface LLMClient {
  analyzeCode(diff: string, context?: string): Promise<CodeAnalysis>;
  generateDocumentation(analysis: CodeAnalysis, template: string): Promise<string>;
  generateDiagram(
    analysis: CodeAnalysis,
    diagramType: "context" | "container" | "component"
  ): Promise<string>;
}

export function createLLMClient(options: LLMClientOptions): LLMClient {
  if (options.provider === "anthropic") {
    return new AnthropicClient(options.apiKey, options.model, options.maxRetries);
  }

  throw new LLMError(`Unsupported LLM provider: ${options.provider}`);
}

class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxRetries: number;

  constructor(apiKey: string, model: string, maxRetries?: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxRetries = maxRetries ?? 3;
  }

  async analyzeCode(diff: string, context?: string): Promise<CodeAnalysis> {
    const prompt = `Analyze the following code diff and provide a structured analysis.

${context ? `Context:\n${context}\n\n` : ""}

Diff:
${diff}

Respond with a JSON object containing:
- summary: A brief summary of the changes
- changes: Array of changes with type, component, description, and impact
- architecturalChanges: Boolean indicating if there are architectural changes
- suggestedDiagrams: Array of suggested C4 diagram types to update`;

    logger.info("Analyzing code with LLM", { model: this.model, diffLength: diff.length });

    return withRetry(
      async () => {
        try {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new LLMError("Unexpected response type from LLM", undefined, {
              responseType: content.type,
            });
          }

          const analysis = JSON.parse(content.text) as CodeAnalysis;
          logger.info("Code analysis completed", { changesCount: analysis.changes.length });
          return analysis;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to analyze code: ${message}`, statusCode, {
            model: this.model,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async generateDocumentation(
    analysis: CodeAnalysis,
    template: string
  ): Promise<string> {
    const prompt = `Generate documentation based on the following analysis and template.

Analysis:
${JSON.stringify(analysis, null, 2)}

Template:
${template}

Generate markdown documentation that fills in the template with the analysis data.`;

    logger.info("Generating documentation with LLM", { model: this.model });

    return withRetry(
      async () => {
        try {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new LLMError("Unexpected response type from LLM", undefined, {
              responseType: content.type,
            });
          }

          logger.info("Documentation generated successfully");
          return content.text;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to generate documentation: ${message}`, statusCode, {
            model: this.model,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async generateDiagram(
    analysis: CodeAnalysis,
    diagramType: "context" | "container" | "component"
  ): Promise<string> {
    const prompt = `Generate a C4 ${diagramType} diagram in Mermaid syntax based on the following analysis.

Analysis:
${JSON.stringify(analysis, null, 2)}

Generate a valid Mermaid diagram that represents the ${diagramType} level of the C4 model.
Only output the Mermaid code, no explanations.`;

    logger.info("Generating diagram with LLM", { model: this.model, diagramType });

    return withRetry(
      async () => {
        try {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new LLMError("Unexpected response type from LLM", undefined, {
              responseType: content.type,
            });
          }

          logger.info("Diagram generated successfully", { diagramType });
          return content.text;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to generate diagram: ${message}`, statusCode, {
            model: this.model,
            diagramType,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (error && typeof error === "object" && "status" in error) {
      return (error as { status: number }).status;
    }
    return undefined;
  }
}
