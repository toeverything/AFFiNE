import { BaseTool } from '@blocksuite/block-std/gfx';

import type { NavigatorMode } from './frame-manager';

export type PresentToolOption = {
  mode?: NavigatorMode;
};

export class PresentTool extends BaseTool<PresentToolOption> {
  static override toolName: string = 'frameNavigator';
}
