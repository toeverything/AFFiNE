import type { FrameTool } from './frame-tool';
import type { PresentTool, PresentToolOption } from './preset-tool';

export * from './frame-block';
export * from './frame-highlight-manager';
export * from './frame-manager';
export * from './frame-spec';
export * from './frame-tool';
export * from './frame-toolbar';
export * from './preset-tool';

declare module '@blocksuite/block-std/gfx' {
  interface GfxToolsMap {
    frameNavigator: PresentTool;
    frame: FrameTool;
  }

  interface GfxToolsOption {
    frameNavigator: PresentToolOption;
  }
}
