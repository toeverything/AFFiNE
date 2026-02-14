# Output Templates

Reference templates for each document produced by the deep-code-analyzer skill. Follow these formats to ensure consistency across scans.

---

## architecture_overview.md Template

````markdown
# Architecture Overview

> Last Updated: YYYY-MM-DD

## Project Summary

| Field          | Value                              |
| -------------- | ---------------------------------- |
| Project        | <project name>                     |
| Tech Stack     | <primary languages and frameworks> |
| Purpose        | <1-2 sentence description>         |
| Monorepo       | Yes/No                             |
| Package Mgr    | <npm/yarn/pnpm/cargo/pip/etc>      |
| Build Tool     | <vite/webpack/cargo/etc>           |
| Test Framework | <vitest/jest/pytest/etc>           |

## Repository Layout

| Directory   | Description   |
| ----------- | ------------- |
| `packages/` | <description> |
| `tools/`    | <description> |
| `scripts/`  | <description> |
| `tests/`    | <description> |
| `docs/`     | <description> |

## Architecture Diagram

\```mermaid
graph TD
A["Module A"] --> B["Module B"]
A --> C["Module C"]
B --> D["Shared Library"]
C --> D
\```

## Key Patterns & Conventions

- **Naming**: <conventions>
- **Folder structure**: <patterns>
- **State management**: <approach>
- **Error handling**: <pattern>

## Build & Development

### Prerequisites

- Node.js vX.X+
- <other requirements>

### Getting Started

\```bash

# Install dependencies

<install command>

# Start development server

<dev command>

# Run tests

<test command>

# Build for production

<build command>
\```
````

---

## module_registry.md Template

```markdown
# Module Registry

> Last Updated: YYYY-MM-DD

## Packages

| Package        | Path         | Purpose       | Internal Deps     | Key External Deps |
| -------------- | ------------ | ------------- | ----------------- | ----------------- |
| `@scope/pkg-a` | `packages/a` | Brief purpose | `pkg-b`, `common` | react, express    |
| `@scope/pkg-b` | `packages/b` | Brief purpose | `common`          | lodash            |

## Module Details

### `@scope/pkg-a`

- **Path**: `packages/a`
- **Purpose**: <1-2 sentence description>
- **Entry Point**: `src/index.ts`
- **Key Exports**: `ClassA`, `functionB`, `TypeC`
- **Internal Dependencies**: `@scope/common`
- **External Dependencies**: `react`, `react-dom`
- **Scripts**: `dev`, `build`, `test`

---

### `@scope/pkg-b`

(repeat for each module)
```

---

## dependency_map.md Template

````markdown
# Dependency Map

> Last Updated: YYYY-MM-DD

## Inter-Module Dependencies

\```mermaid
graph LR
subgraph Frontend
FE["frontend"]
end
subgraph Backend
BE["backend"]
end
subgraph Common
CM["common"]
end

    FE --> CM
    BE --> CM

\```

## Shared Packages

| Package  | Depended on by    | Purpose                |
| -------- | ----------------- | ---------------------- |
| `common` | frontend, backend | Shared types and utils |

## External Service Integrations

| Service    | Used By | Purpose            |
| ---------- | ------- | ------------------ |
| PostgreSQL | backend | Primary data store |
| Redis      | backend | Caching layer      |
````

---

## conventions_and_patterns.md Template

```markdown
# Conventions & Patterns

> Last Updated: YYYY-MM-DD

## Code Style

- **Linter**: <ESLint/Clippy/etc> with config at `<path>`
- **Formatter**: <Prettier/rustfmt/black/etc> with config at `<path>`
- **Editor Config**: `<path to .editorconfig>`

## Testing

- **Framework**: <Vitest/Jest/pytest/etc>
- **Location**: Tests in `<pattern, e.g. __tests__/ or *.test.ts>`
- **Coverage**: <tool and config>

## Patterns

### State Management

<description of how state is managed>

### Error Handling

<description of error handling patterns>

### API Design

<description of API patterns>

### Custom Abstractions

| Abstraction   | Location                      | Purpose                 |
| ------------- | ----------------------------- | ----------------------- |
| `BaseService` | `packages/common/src/base.ts` | Base class for services |
```
