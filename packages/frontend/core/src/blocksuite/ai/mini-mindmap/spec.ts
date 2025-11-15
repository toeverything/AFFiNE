import { SurfaceBlockSchema } from '@blocksuite/affine/blocks/surface';
import { ConnectorElementRendererExtension } from '@blocksuite/affine/gfx/connector';
import {
  MindmapElementRendererExtension,
  MindMapView,
} from '@blocksuite/affine/gfx/mindmap';
import { ShapeElementRendererExtension } from '@blocksuite/affine/gfx/shape';
import { TextElementRendererExtension } from '@blocksuite/affine/gfx/text';
import { RootBlockSchema } from '@blocksuite/affine/model';
import {
  DocModeService,
  ThemeService,
} from '@blocksuite/affine/shared/services';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/affine/std';
import type { BlockSchema, ExtensionType } from '@blocksuite/affine/store';
import { literal } from 'lit/static-html.js';
import type { z } from 'zod';

import { MindmapService } from './mindmap-service.js';
import { MindmapSurfaceBlockService } from './surface-service.js';

export const MiniMindmapSpecs: ExtensionType[] = [
  DocModeService,
  ThemeService,
  FlavourExtension('affine:page'),
  MindmapService,
  BlockViewExtension('affine:page', literal`mini-mindmap-root-block`),
  FlavourExtension('affine:surface'),
  MindMapView,
  MindmapSurfaceBlockService,
  BlockViewExtension('affine:surface', literal`mini-mindmap-surface-block`),
  TextElementRendererExtension,
  MindmapElementRendererExtension,
  ShapeElementRendererExtension,
  ConnectorElementRendererExtension,
];

export const MiniMindmapSchema: z.infer<typeof BlockSchema>[] = [
  RootBlockSchema,
  SurfaceBlockSchema,
];
