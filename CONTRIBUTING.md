# Contributing to DocSync

Thank you for your interest in contributing to DocSync! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 9+
- Git

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/docsync.git
   cd docsync
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Code Style

- We use ESLint for linting TypeScript code
- Run `npm run lint` before committing
- Follow existing code patterns and conventions

### Naming Conventions

- **Files**: `kebab-case.ts` for utilities, `PascalCase.ts` for classes
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (no `I` prefix)

## Testing

- Write tests for new features and bug fixes
- Run the test suite before submitting:
  ```bash
  npm test
  ```
- Aim for meaningful test coverage
- Tests are located in `__tests__` directories next to the code they test

### Test Structure

```typescript
describe("ModuleName", () => {
  describe("functionName", () => {
    it("should do something specific", () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(webhook): add signature verification
fix(llm): handle rate limit errors
docs(readme): update configuration section
```

## Pull Request Process

1. Ensure all tests pass (`npm test`)
2. Ensure linting passes (`npm run lint`)
3. Update documentation if needed
4. Create a pull request with a clear description
5. Link any related issues

### PR Title Format

Use the same format as commit messages:
```
feat(scope): description
```

### PR Description Template

```markdown
## Summary
Brief description of changes

## Changes
- Change 1
- Change 2

## Testing
How was this tested?

## Related Issues
Closes #123
```

## Project Structure

```
src/
├── config/         # Configuration management
├── errors/         # Error classes and retry logic
├── webhook/        # GitHub webhook handling
├── git/            # Git operations
├── llm/            # LLM integration
├── docs/           # Documentation generation
├── diagrams/       # Diagram generation
├── pr/             # PR creation
└── index.ts        # Entry point
```

## Adding New Features

1. **Discuss first**: For major features, open an issue to discuss before implementing
2. **Keep it focused**: One feature per PR
3. **Add tests**: New features should include tests
4. **Update docs**: Update README if adding user-facing features

## Error Handling

- Use custom error classes from `src/errors/index.ts`
- Mark errors as retryable when appropriate
- Include context in error messages
- Use the structured logger for consistent logging

Example:
```typescript
import { LLMError, logger } from "../errors/index.js";

try {
  // operation
} catch (error) {
  logger.error("Operation failed", error, { context: "value" });
  throw new LLMError("Failed to process", statusCode, { details });
}
```

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Check existing issues and PRs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
