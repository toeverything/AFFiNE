---
name: deep-code-analyzer
description: Deep code structure analyzer that scans an entire codebase and produces comprehensive documentation (architecture overview, dependency map, module summaries, and key patterns). This skill should be used when an agent needs to quickly understand a new or existing codebase, or when documentation needs to be created or refreshed so that other agents can better catch up on context.
---

# Deep Code Analyzer

## Overview

This skill scans an entire project's code structure and produces a set of living documents that capture the architecture, key modules, dependencies, conventions, and patterns. The output is designed to help other AI agents (or new human contributors) rapidly build context on the codebase without having to re-discover everything from scratch.

## When to Use

- When onboarding a new agent to a codebase
- When the codebase has changed significantly and documentation is stale
- When the user explicitly requests a codebase scan or architecture refresh
- Before starting a large cross-cutting feature to understand the landscape

## Workflow

### Step 1: Discover the Project Root

Identify the project root directory. If the user provides a path, use it. Otherwise, use the current workspace root.

### Step 2: Run the Structure Scan

Execute the bundled scan script to collect raw structural data:

```bash
python3 <skill-dir>/scripts/scan_structure.py <project-root> --output <output-dir>
```

The script produces a JSON file (`structure_data.json`) containing:

- Directory tree (excluding `node_modules`, `.git`, `target`, `dist`, `build`, `.next`, `.yarn`, `__pycache__`)
- File type distribution and counts
- Package/module metadata (from `package.json`, `Cargo.toml`, `pyproject.toml`, etc.)
- Entry points and configuration files

> **Note:** The scan script only reads metadata and file structure — it does NOT read file contents. The content analysis happens in Step 3 by the agent.

### Step 3: Analyze Key Modules

Using the structure data from Step 2, perform deeper analysis on the most important parts of the codebase:

1. **Identify top-level packages/modules** — Read their `package.json`, `Cargo.toml`, or equivalent manifest files
2. **Map dependencies** — Both inter-package dependencies within the monorepo and external dependencies
3. **Identify entry points** — `main.ts`, `index.ts`, `lib.rs`, `main.py`, etc.
4. **Scan for architectural patterns** — Folder naming conventions, layering (e.g., `core`, `api`, `ui`), plugin systems
5. **Identify key configuration** — Build tools (Vite, Webpack, Cargo), test frameworks (Vitest, Jest, pytest), linters, CI/CD

For each key module, read the entry point or main export file (view the outline first, then key functions if needed) to understand its purpose.

### Step 4: Generate Documentation

Produce the following documents in the output directory. If documents already exist, update them rather than overwriting — preserve any manual edits or annotations.

#### 4a. `architecture_overview.md`

High-level architecture document containing:

- **Project Summary** — What the project is, its tech stack, and primary purpose
- **Repository Layout** — Top-level directory structure with descriptions
- **Architecture Diagram** — A Mermaid diagram showing how major modules connect
- **Key Patterns & Conventions** — Naming conventions, folder structure patterns, coding standards
- **Build & Dev Setup** — How to install, run, build, and test

#### 4b. `module_registry.md`

A registry of all packages/modules with for each:

- Name and path
- Brief purpose (1-2 sentences)
- Key exports or entry points
- Internal dependencies (other modules in the repo)
- External dependencies (notable third-party libraries)

#### 4c. `dependency_map.md`

A dependency graph showing:

- Inter-module dependencies as a Mermaid graph
- Shared/common packages and who depends on them
- External service integrations (databases, APIs, cloud services)

#### 4d. `conventions_and_patterns.md`

Document covering:

- Code style and linting configuration
- Testing patterns and frameworks
- State management approaches
- Error handling patterns
- Any custom abstractions or base classes used widely

### Step 5: Summary Report

After generating all documents, provide a brief summary to the user listing:

- Total files and directories scanned
- Number of modules/packages discovered
- Any areas that need attention (e.g., circular dependencies, missing tests, undocumented modules)
- Suggestions for further deep-dives

## Output Location

By default, output documentation to: `<project-root>/.agent/docs/`

This keeps the docs close to the codebase while being clearly separated from production code. If the user specifies a different output path, use that instead.

## Important Guidelines

- **Be incremental**: If docs already exist, read them first and update only what has changed. Add a "Last Updated" timestamp header.
- **Respect .gitignore**: Do not scan `node_modules`, `.git`, `target`, `dist`, `build`, or other build artifacts.
- **Keep it scannable**: Use tables, Mermaid diagrams, and bullet points. Avoid walls of prose.
- **Size guard**: For very large codebases (>1000 files), focus on the top-level packages and their immediate children. Note skipped areas and suggest follow-up scans.
- **Verify structure data**: Always verify the scan script output before using it. If the script fails, fall back to manual exploration using `list_dir`, `find_by_name`, and `view_file_outline`.

## Scripts

### `scripts/scan_structure.py`

Scans the project directory tree and collects metadata into `structure_data.json`. Usage:

```bash
python3 <skill-dir>/scripts/scan_structure.py <project-root> --output <output-dir>
```

Arguments:

- `<project-root>`: Path to the root of the codebase to scan
- `--output <output-dir>`: Directory to write `structure_data.json` (default: `<project-root>/.agent/docs/`)
- `--max-depth <n>`: Maximum directory depth to scan (default: 6)
- `--include-hidden`: Include hidden directories (default: exclude except `.github`)

## References

### `references/output_templates.md`

Contains templates for each output document. Reference these when generating the documentation to ensure consistent formatting across scans.
