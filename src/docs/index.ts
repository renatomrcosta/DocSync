import type { CodeAnalysis } from "../llm/index.js";

export interface DocumentationTemplate {
  name: string;
  content: string;
}

export const templates: Record<string, DocumentationTemplate> = {
  changeSummary: {
    name: "Change Summary",
    content: `---
title: {{title}}
date: {{date}}
pr: {{prNumber}}
author: {{author}}
---

# Change Summary

## Overview

{{summary}}

## Changes

{{#each changes}}
### {{component}}

- **Type**: {{type}}
- **Impact**: {{impact}}
- **Description**: {{description}}

{{/each}}

## Related Links

- [Source PR]({{prUrl}})
`,
  },
  apiDocumentation: {
    name: "API Documentation",
    content: `---
title: API Documentation - {{component}}
date: {{date}}
---

# {{component}} API

## Overview

{{description}}

## Endpoints

{{endpoints}}

## Related Diagrams

{{diagrams}}
`,
  },
  architectureUpdate: {
    name: "Architecture Update",
    content: `---
title: Architecture Update
date: {{date}}
pr: {{prNumber}}
---

# Architecture Update

## Summary

{{summary}}

## Diagram

\`\`\`mermaid
{{diagram}}
\`\`\`

## Impact

{{impact}}
`,
  },
};

export interface GeneratedDocument {
  filename: string;
  content: string;
  template: string;
}

export function generateFilename(
  analysis: CodeAnalysis,
  prNumber: number,
  template: string
): string {
  const date = new Date().toISOString().split("T")[0];
  const slug = analysis.summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);
  return `${date}-pr-${prNumber}-${template}-${slug}.md`;
}

export function renderTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, String(value));
  }

  return result;
}
