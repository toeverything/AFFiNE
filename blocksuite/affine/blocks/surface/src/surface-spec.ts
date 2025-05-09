import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import {
  EdgelessCRUDExtension,
  EdgelessLegacySlotExtension,
} from './extensions';
import { ExportManagerExtension } from './extensions/export-manager/export-manager';

const CommonSurfaceBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:surface'),
  EdgelessCRUDExtension,
  EdgelessLegacySlotExtension,
  ExportManagerExtension,
];

export const PageSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  BlockViewExtension('affine:surface', literal`affine-surface-void`),
];

export const EdgelessSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  BlockViewExtension('affine:surface', literal`affine-surface`),
];
