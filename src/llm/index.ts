import Anthropic from "@anthropic-ai/sdk";

export interface LLMClientOptions {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
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
    return new AnthropicClient(options.apiKey, options.model);
  }

  throw new Error(`Unsupported LLM provider: ${options.provider}`);
}

class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    return JSON.parse(content.text) as CodeAnalysis;
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    return content.text;
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    return content.text;
  }
}
