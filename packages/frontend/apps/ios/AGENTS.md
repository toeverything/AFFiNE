# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the AFFiNE iOS application built with Capacitor, React, and TypeScript. It's a hybrid mobile app that wraps a React web application in a native iOS shell.

## Development Commands

### Build and Development

- `yarn dev` - Start development server with live reload
- `yarn build` - Build the web application
- `yarn sync` - Sync web assets with Capacitor iOS project
- `yarn sync:dev` - Sync with development server (CAP_SERVER_URL=http://localhost:8080)
- `yarn xcode` - Open Xcode project
- `yarn codegen` - Generate GraphQL and Rust bindings
- `xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 15' build | xcbeautify` - Build iOS project with xcbeautify

### iOS Build Process

1. `BUILD_TYPE=canary PUBLIC_PATH="/" yarn affine @affine/ios build` - Build web assets
2. `yarn affine @affine/ios cap sync` - Sync with iOS project
3. `yarn affine @affine/ios cap open ios` - Open in Xcode

### Live Reload Setup

1. Run `yarn dev` and select `ios` for Distribution option
2. Run `yarn affine @affine/ios sync:dev`
3. Run `yarn affine @affine/ios cap open ios`

## Architecture

### Core Technologies

- **Capacitor 7.x** - Native iOS bridge
- **React 19** - UI framework
- **TypeScript** - Language
- **Blocksuite** - Document editor
- **DI Framework** - Dependency injection via `@toeverything/infra`

### Key Directories

- `src/` - React application source
- `App/` - Native iOS Swift code
- `dist/` - Built web assets
- `capacitor-cordova-ios-plugins/` - Capacitor plugins

### Native Bridge Integration

The app exposes JavaScript APIs to native iOS code through `window` object:

- `getCurrentServerBaseUrl()` - Get current server URL
- `getCurrentI18nLocale()` - Get current locale
- `getAiButtonFeatureFlag()` - Check AI button feature flag
- `getCurrentWorkspaceId()` - Get current workspace ID
- `getCurrentDocId()` - Get current document ID
- `getCurrentDocContentInMarkdown()` - Export current doc as markdown
- `createNewDocByMarkdownInCurrentWorkspace()` - Import markdown as new doc

### Swift Code Style

Follow the guidelines in `AGENTS.md`:

- 2-space indentation
- PascalCase for types, camelCase for properties/methods
- Modern Swift features: `@Observable`, `async/await`, `actor`
- Protocol-oriented design, dependency injection
- Early returns, guard statements for optional unwrapping

### Build Configuration

- TypeScript config extends `../../../../tsconfig.web.json`
- Webpack bundling via `@affine-tools/cli`
- Capacitor config in `capacitor.config.ts`
- GraphQL codegen via Apollo
- Rust bindings generated via Uniffi

### Dependencies

- Workspace packages: `@affine/core`, `@affine/component`, `@affine/env`
- Capacitor plugins: App, Browser, Haptics, Keyboard
- React ecosystem: React Router, Next Themes
- Storage: IDB, Yjs for collaborative editing

### Testing and Quality

- TypeScript strict mode enabled
- ESLint/Prettier configuration from workspace root
- No specific test commands in this package (tests likely in workspace root)

# Swift Code Style Guidelines

## Core Style

- **Indentation**: 2 spaces
- **Braces**: Opening brace on same line
- **Spacing**: Single space around operators and commas
- **Naming**: PascalCase for types, camelCase for properties/methods

## File Organization

- Logical directory grouping
- PascalCase files for types, `+` for extensions
- Modular design with extensions

## Modern Swift Features

- **@Observable macro**: Replace `ObservableObject`/`@Published`
- **Swift concurrency**: `async/await`, `Task`, `actor`, `@MainActor`
- **Result builders**: Declarative APIs
- **Property wrappers**: Use line breaks for long declarations
- **Opaque types**: `some` for protocol returns

## Code Structure

- Early returns to reduce nesting
- Guard statements for optional unwrapping
- Single responsibility per type/extension
- Value types over reference types

## Error Handling

- `Result` enum for typed errors
- `throws`/`try` for propagation
- Optional chaining with `guard let`/`if let`
- Typed error definitions

## Architecture

- Avoid using protocol-oriented design unless necessary
- Dependency injection over singletons
- Composition over inheritance
- Factory/Repository patterns

## Debug Assertions

- Use `assert()` for development-time invariant checking
- Use `assertionFailure()` for unreachable code paths
- Assertions removed in release builds for performance
- Precondition checking with `precondition()` for fatal errors

## Memory Management

- `weak` references for cycles
- `unowned` when guaranteed non-nil
- Capture lists in closures
- `deinit` for cleanup
