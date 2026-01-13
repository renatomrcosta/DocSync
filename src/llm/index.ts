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

export interface CodebaseAnalysis {
  summary: string;
  purpose: string;
  architecture: string;
  components: Array<{
    name: string;
    description: string;
    responsibilities: string[];
    dependencies: string[];
  }>;
  externalSystems: Array<{
    name: string;
    description: string;
    integration: string;
  }>;
  technologies: string[];
  gettingStarted: string;
  configuration: string;
}

export interface LLMClient {
  analyzeCode(diff: string, context?: string): Promise<CodeAnalysis>;
  analyzeCodebase(
    codebaseContent: string,
    repoInfo: { owner: string; repo: string }
  ): Promise<CodebaseAnalysis>;
  generateDocumentation(analysis: CodeAnalysis, template: string): Promise<string>;
  generateDiagram(
    analysis: CodeAnalysis,
    diagramType: "context" | "container" | "component"
  ): Promise<string>;
  generateCodebaseDiagram(
    analysis: CodebaseAnalysis,
    diagramType: "context" | "container" | "component"
  ): Promise<string>;
  updateDocumentation(
    existingDocs: string,
    analysis: CodeAnalysis,
    prInfo: { number: number; title: string; author: string }
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

  async analyzeCodebase(
    codebaseContent: string,
    repoInfo: { owner: string; repo: string }
  ): Promise<CodebaseAnalysis> {
    const prompt = `Analyze the following codebase and provide a comprehensive analysis for documentation purposes.

Repository: ${repoInfo.owner}/${repoInfo.repo}

Codebase content:
${codebaseContent}

Respond with a JSON object containing:
- summary: A brief overview of what this project does (2-3 sentences)
- purpose: The main purpose and goals of the project
- architecture: High-level description of the architecture and patterns used
- components: Array of main components with name, description, responsibilities (array), and dependencies (array)
- externalSystems: Array of external systems/services with name, description, and integration method
- technologies: Array of key technologies, frameworks, and tools used
- gettingStarted: Brief instructions on how to get started with the project
- configuration: Description of key configuration options

Focus on accuracy and clarity. Be specific about the actual components found in the code.`;

    logger.info("Analyzing codebase with LLM", {
      model: this.model,
      contentLength: codebaseContent.length,
    });

    return withRetry(
      async () => {
        try {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new LLMError("Unexpected response type from LLM", undefined, {
              responseType: content.type,
            });
          }

          // Extract JSON from response (handle markdown code blocks)
          let jsonText = content.text;
          const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            jsonText = jsonMatch[1];
          }

          const analysis = JSON.parse(jsonText) as CodebaseAnalysis;
          logger.info("Codebase analysis completed", {
            componentsCount: analysis.components.length,
          });
          return analysis;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to analyze codebase: ${message}`, statusCode, {
            model: this.model,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async generateCodebaseDiagram(
    analysis: CodebaseAnalysis,
    diagramType: "context" | "container" | "component"
  ): Promise<string> {
    const diagramPrompts = {
      context: `Generate a C4 Context diagram in Mermaid syntax showing:
- The main system and its purpose
- External users/actors who interact with it
- External systems it integrates with
Use the C4Context Mermaid syntax.`,
      container: `Generate a C4 Container diagram in Mermaid syntax showing:
- The main containers (applications, services, databases)
- How they communicate with each other
- The technologies used by each container
Use the C4Container Mermaid syntax.`,
      component: `Generate a C4 Component diagram in Mermaid syntax showing:
- The main components within the system
- Their responsibilities and relationships
- Key interfaces between components
Use the C4Component Mermaid syntax.`,
    };

    const prompt = `${diagramPrompts[diagramType]}

Based on this codebase analysis:
${JSON.stringify(analysis, null, 2)}

Generate a valid Mermaid C4 diagram. Only output the Mermaid code block, no explanations.
The diagram should accurately represent the architecture described in the analysis.`;

    logger.info("Generating codebase diagram with LLM", { model: this.model, diagramType });

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

          logger.info("Codebase diagram generated successfully", { diagramType });
          return content.text;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to generate codebase diagram: ${message}`, statusCode, {
            model: this.model,
            diagramType,
          });
        }
      },
      { maxRetries: this.maxRetries }
    );
  }

  async updateDocumentation(
    existingDocs: string,
    analysis: CodeAnalysis,
    prInfo: { number: number; title: string; author: string }
  ): Promise<string> {
    const prompt = `You are updating existing project documentation based on new code changes.

## Existing Documentation:
${existingDocs}

## Changes from PR #${prInfo.number} (${prInfo.title}) by ${prInfo.author}:
${JSON.stringify(analysis, null, 2)}

## Instructions:
1. Update the existing documentation to reflect the changes from this PR
2. Preserve the overall structure and formatting of the document
3. Update the "date" in the frontmatter to today's date
4. If there are architectural changes, update the relevant sections and diagrams
5. Add or modify component descriptions if new components were added or existing ones changed
6. Update the configuration section if config options changed
7. Keep all unchanged sections intact

Return the complete updated documentation. Do not add explanations, just return the updated markdown document.`;

    logger.info("Updating documentation with LLM", {
      model: this.model,
      prNumber: prInfo.number,
    });

    return withRetry(
      async () => {
        try {
          const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new LLMError("Unexpected response type from LLM", undefined, {
              responseType: content.type,
            });
          }

          logger.info("Documentation updated successfully", { prNumber: prInfo.number });
          return content.text;
        } catch (error) {
          if (error instanceof LLMError) {
            throw error;
          }
          const statusCode = this.extractStatusCode(error);
          const message = error instanceof Error ? error.message : String(error);
          throw new LLMError(`Failed to update documentation: ${message}`, statusCode, {
            model: this.model,
            prNumber: prInfo.number,
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
