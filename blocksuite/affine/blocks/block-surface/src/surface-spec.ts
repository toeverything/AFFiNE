import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import {
  EdgelessSurfaceBlockAdapterExtensions,
  SurfaceBlockAdapterExtensions,
} from './adapters/extension';
import {
  EdgelessCRUDExtension,
  EdgelessLegacySlotExtension,
} from './extensions';
import { ExportManagerExtension } from './extensions/export-manager/export-manager';
import { SurfaceBlockService } from './surface-service';

const CommonSurfaceBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:surface'),
  SurfaceBlockService,
  EdgelessCRUDExtension,
  EdgelessLegacySlotExtension,
  ExportManagerExtension,
];

export const PageSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  ...SurfaceBlockAdapterExtensions,
  BlockViewExtension('affine:surface', literal`affine-surface-void`),
];

export const EdgelessSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  ...EdgelessSurfaceBlockAdapterExtensions,
  BlockViewExtension('affine:surface', literal`affine-surface`),
];
