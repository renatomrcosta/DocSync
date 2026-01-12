import {
  generateMermaidC4,
  validateMermaidSyntax,
  C4Diagram,
  DiagramElement,
  DiagramRelationship,
} from "../index";

describe("Diagrams Module", () => {
  describe("generateMermaidC4", () => {
    it("should generate basic C4 context diagram", () => {
      const diagram: C4Diagram = {
        level: "context",
        title: "System Context",
        elements: [
          { id: "user", label: "User", type: "person" },
          { id: "system", label: "My System", type: "system" },
        ],
        relationships: [
          { from: "user", to: "system", label: "Uses" },
        ],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain("```mermaid");
      expect(result).toContain("C4Context");
      expect(result).toContain("title System Context");
      expect(result).toContain('Person(user, "User")');
      expect(result).toContain('System(system, "My System")');
      expect(result).toContain('Rel(user, system, "Uses")');
      expect(result).toContain("```");
    });

    it("should include element descriptions when provided", () => {
      const diagram: C4Diagram = {
        level: "context",
        title: "Test",
        elements: [
          {
            id: "api",
            label: "API Gateway",
            type: "container",
            description: "Handles incoming requests",
          },
        ],
        relationships: [],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain('Container(api, "API Gateway", "Handles incoming requests")');
    });

    it("should handle external systems", () => {
      const diagram: C4Diagram = {
        level: "context",
        title: "External Systems",
        elements: [
          { id: "ext", label: "External API", type: "system", external: true },
          { id: "extPerson", label: "External User", type: "person", external: true },
        ],
        relationships: [],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain('System_Ext(ext, "External API")');
      expect(result).toContain('Person_Ext(extPerson, "External User")');
    });

    it("should handle all element types", () => {
      const elements: DiagramElement[] = [
        { id: "p", label: "Person", type: "person" },
        { id: "s", label: "System", type: "system" },
        { id: "c", label: "Container", type: "container" },
        { id: "comp", label: "Component", type: "component" },
        { id: "db", label: "Database", type: "database" },
        { id: "q", label: "Queue", type: "queue" },
      ];

      const diagram: C4Diagram = {
        level: "container",
        title: "All Types",
        elements,
        relationships: [],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain("Person(p,");
      expect(result).toContain("System(s,");
      expect(result).toContain("Container(c,");
      expect(result).toContain("Component(comp,");
      expect(result).toContain("ContainerDb(db,");
      expect(result).toContain("ContainerQueue(q,");
    });

    it("should handle external variants of all types", () => {
      const elements: DiagramElement[] = [
        { id: "db", label: "External DB", type: "database", external: true },
        { id: "q", label: "External Queue", type: "queue", external: true },
        { id: "c", label: "External Container", type: "container", external: true },
        { id: "comp", label: "External Component", type: "component", external: true },
      ];

      const diagram: C4Diagram = {
        level: "component",
        title: "External Types",
        elements,
        relationships: [],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain("ContainerDb_Ext(db,");
      expect(result).toContain("ContainerQueue_Ext(q,");
      expect(result).toContain("Container_Ext(c,");
      expect(result).toContain("Component_Ext(comp,");
    });

    it("should include technology in relationships when provided", () => {
      const diagram: C4Diagram = {
        level: "container",
        title: "Tech Stack",
        elements: [
          { id: "api", label: "API", type: "container" },
          { id: "db", label: "Database", type: "database" },
        ],
        relationships: [
          { from: "api", to: "db", label: "Reads/Writes", technology: "PostgreSQL" },
        ],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain('Rel(api, db, "Reads/Writes", "PostgreSQL")');
    });

    it("should handle empty relationships", () => {
      const diagram: C4Diagram = {
        level: "context",
        title: "No Relations",
        elements: [{ id: "sys", label: "System", type: "system" }],
        relationships: [],
      };

      const result = generateMermaidC4(diagram);

      expect(result).toContain("```mermaid");
      expect(result).toContain("C4Context");
      expect(result).not.toContain("Rel(");
    });
  });

  describe("validateMermaidSyntax", () => {
    it("should validate correct mermaid C4 diagram", () => {
      const mermaid = `\`\`\`mermaid
C4Context
    title System Context
    Person(user, "User")
    System(system, "System")
    Rel(user, system, "Uses")
\`\`\``;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing mermaid code block", () => {
      const mermaid = `C4Context
    title System Context
    Person(user, "User")`;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing mermaid code block");
    });

    it("should detect missing C4 diagram type", () => {
      const mermaid = `\`\`\`mermaid
    title System Context
    Person(user, "User")
\`\`\``;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing C4 diagram type declaration");
    });

    it("should accept C4Container as valid diagram type", () => {
      const mermaid = `\`\`\`mermaid
C4Container
    title Container Diagram
    Container(api, "API")
\`\`\``;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(true);
    });

    it("should detect mismatched parentheses", () => {
      const mermaid = `\`\`\`mermaid
C4Context
    title Test
    Person(user, "User"
    System(system, "System")
\`\`\``;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Mismatched parentheses");
    });

    it("should return multiple errors when applicable", () => {
      const mermaid = `flowchart TD
    A --> B(`;

      const result = validateMermaidSyntax(mermaid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it("should validate diagram generated by generateMermaidC4", () => {
      const diagram: C4Diagram = {
        level: "context",
        title: "Generated Diagram",
        elements: [
          { id: "user", label: "User", type: "person" },
          { id: "system", label: "System", type: "system", description: "Main system" },
        ],
        relationships: [
          { from: "user", to: "system", label: "Uses", technology: "HTTPS" },
        ],
      };

      const generated = generateMermaidC4(diagram);
      const result = validateMermaidSyntax(generated);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
