export type DiagramLevel = "context" | "container" | "component";

export interface DiagramElement {
  id: string;
  label: string;
  type: "person" | "system" | "container" | "component" | "database" | "queue";
  description?: string;
  external?: boolean;
}

export interface DiagramRelationship {
  from: string;
  to: string;
  label: string;
  technology?: string;
}

export interface C4Diagram {
  level: DiagramLevel;
  title: string;
  elements: DiagramElement[];
  relationships: DiagramRelationship[];
}

export function generateMermaidC4(diagram: C4Diagram): string {
  const lines: string[] = [];

  lines.push("```mermaid");
  lines.push("C4Context");
  lines.push(`    title ${diagram.title}`);
  lines.push("");

  for (const element of diagram.elements) {
    const directive = getMermaidDirective(element.type, element.external);
    const desc = element.description ? `, "${element.description}"` : "";
    lines.push(`    ${directive}(${element.id}, "${element.label}"${desc})`);
  }

  lines.push("");

  for (const rel of diagram.relationships) {
    const tech = rel.technology ? `, "${rel.technology}"` : "";
    lines.push(`    Rel(${rel.from}, ${rel.to}, "${rel.label}"${tech})`);
  }

  lines.push("```");

  return lines.join("\n");
}

function getMermaidDirective(
  type: DiagramElement["type"],
  external?: boolean
): string {
  const prefix = external ? "System_Ext" : "";

  switch (type) {
    case "person":
      return external ? "Person_Ext" : "Person";
    case "system":
      return external ? "System_Ext" : "System";
    case "container":
      return external ? "Container_Ext" : "Container";
    case "component":
      return external ? "Component_Ext" : "Component";
    case "database":
      return external ? "ContainerDb_Ext" : "ContainerDb";
    case "queue":
      return external ? "ContainerQueue_Ext" : "ContainerQueue";
    default:
      return prefix || "System";
  }
}

export function validateMermaidSyntax(mermaid: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!mermaid.includes("```mermaid")) {
    errors.push("Missing mermaid code block");
  }

  if (!mermaid.includes("C4Context") && !mermaid.includes("C4Container")) {
    errors.push("Missing C4 diagram type declaration");
  }

  const openParens = (mermaid.match(/\(/g) || []).length;
  const closeParens = (mermaid.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push("Mismatched parentheses");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
