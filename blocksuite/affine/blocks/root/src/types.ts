import type { EdgelessRootBlockComponent } from './edgeless/edgeless-root-block.js';
import type { PageRootBlockComponent } from './page/page-root-block.js';

export type RootBlockComponent =
  | PageRootBlockComponent
  | EdgelessRootBlockComponent;
