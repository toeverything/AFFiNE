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
import { ConnectorElementView } from './view/connector';
import { MindMapView } from './view/mindmap';

const CommonSurfaceBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:surface'),
  SurfaceBlockService,
  EdgelessCRUDExtension,
  EdgelessLegacySlotExtension,
  ExportManagerExtension,
];

const ElementModelViews = [MindMapView, ConnectorElementView];

export const PageSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  ...SurfaceBlockAdapterExtensions,
  BlockViewExtension('affine:surface', literal`affine-surface-void`),
];

export const EdgelessSurfaceBlockSpec: ExtensionType[] = [
  ...CommonSurfaceBlockSpec,
  ...EdgelessSurfaceBlockAdapterExtensions,
  ...ElementModelViews,
  BlockViewExtension('affine:surface', literal`affine-surface`),
];
