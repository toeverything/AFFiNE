import type { MenuConfig } from '@blocksuite/affine-components/context-menu';
import type { BlockComponent } from '@blocksuite/block-std';
import type { GfxController, GfxToolsMap } from '@blocksuite/block-std/gfx';
import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';
import { type TemplateResult } from 'lit';

export interface QuickTool {
  type?: keyof GfxToolsMap;
  enable?: boolean;
  content: TemplateResult;
  /**
   * if not configured, the tool will not be shown in dense mode
   */
  menu?: MenuConfig;
}

export interface SeniorTool {
  /**
   * Used to show in nav-button's tooltip
   */
  name: string;
  content: TemplateResult;
  enable?: boolean;
}

export type ToolBuilder<T> = (options: {
  block: BlockComponent;
  gfx: GfxController;
  toolbarContainer: HTMLElement;
}) => T;

export const QuickToolIdentifier = createIdentifier<ToolBuilder<QuickTool>>(
  'edgeless-quick-tool'
);
export const SeniorToolIdentifier = createIdentifier<ToolBuilder<SeniorTool>>(
  'edgeless-senior-tool'
);

export const QuickToolExtension = (
  id: string,
  builder: ToolBuilder<QuickTool>
): ExtensionType => {
  return {
    setup: di => {
      di.addImpl(QuickToolIdentifier(id), () => builder);
    },
  };
};

export const SeniorToolExtension = (
  id: string,
  builder: ToolBuilder<SeniorTool>
): ExtensionType => {
  return {
    setup: di => {
      di.addImpl(SeniorToolIdentifier(id), () => builder);
    },
  };
};
