# DocSync

Automated documentation generator triggered by merged PRs with C4 diagram support.

## Overview

DocSync is a service that automatically generates and updates documentation when pull requests are merged. It analyzes code changes using LLM, generates relevant C4 diagrams in Mermaid format, and opens a documentation PR for developer review.

## Features

- Webhook receiver for GitHub PR events
- Automatic code change analysis using LLM
- C4 diagram generation (Context, Container, Component levels)
- Documentation PR creation with reviewer assignment
- Optional Slack notifications

## Project Structure

```
src/
├── config/     # Configuration management
├── webhook/    # GitHub webhook receiver
├── git/        # Git client for repo operations
├── llm/        # LLM client (Anthropic)
├── docs/       # Documentation templates
├── diagrams/   # C4 diagram generation
├── pr/         # PR creation and management
└── index.ts    # Application entry point
```

## Getting Started

### Prerequisites

- Node.js 20+
- GitHub Personal Access Token or GitHub App
- Anthropic API key

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## License

MIT
