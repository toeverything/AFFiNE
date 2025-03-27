import {
  BlockViewExtension,
  FlavourExtension,
} from '@blocksuite/affine/block-std';
import { SurfaceBlockSchema } from '@blocksuite/affine/blocks/surface';
import { MindMapView } from '@blocksuite/affine/gfx/mindmap';
import { RootBlockSchema } from '@blocksuite/affine/model';
import {
  DocModeService,
  ThemeService,
} from '@blocksuite/affine/shared/services';
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
];

export const MiniMindmapSchema: z.infer<typeof BlockSchema>[] = [
  RootBlockSchema,
  SurfaceBlockSchema,
];
