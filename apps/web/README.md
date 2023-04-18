# AFFiNE Web

This is the web application for AFFiNE. It is a React application that uses the [Next.js](https://nextjs.org/) framework.

## Getting Started

First, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:8080](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/pages/workspace/[workspaceId]/all.tsx`. The page auto-updates as you edit the file.

For more information on Next.js, take a look at the [Next.js Documentation](https://nextjs.org/docs).

## Build Presets

`preset.config.mjs` contains the build presets for the application. The presets are used to configure the build process for different environments. The presets are:

- `enableBroadCastChannelProvider`: Enables the Broadcast Channel provider for the application. This is used to communicate between local browser tabs.
- `enableDebugPage`: Enables the debug page for the application. This is used for debugging purposes.

## BlockSuite Integration

Set `LOCAL_BLOCK_SUITE=/path/to/blocksuite` to use a local version of [BlockSuite](https://github.com/toeverything/blocksuite). This is useful for development.
