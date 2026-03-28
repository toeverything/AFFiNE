import type { I18nString } from '@affine/i18n';
import type { DocMode } from '@blocksuite/affine/model';
import type { Chain, EditorHost, InitCommandCtx } from '@blocksuite/affine/std';
import type { TemplateResult } from 'lit';

export interface AIItemGroupConfig {
  name?: I18nString;
  testId?: string;
  items: AIItemConfig[];
}

export interface AIItemConfig {
  name: I18nString;
  testId: string;
  icon: TemplateResult | (() => HTMLElement);
  showWhen?: (
    chain: Chain<InitCommandCtx>,
    editorMode: DocMode,
    host: EditorHost
  ) => boolean;
  subItem?: AISubItemConfig[];
  subItemOffset?: [number, number];
  handler?: (host: EditorHost) => void;
  beta?: boolean;
}

export interface AISubItemConfig {
  type: I18nString;
  testId?: string;
  handler?: (host: EditorHost) => void;
}
