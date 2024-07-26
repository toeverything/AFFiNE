import type { WorkflowGraphs } from '../types';
import { brainstorm } from './brainstorm';
import { anime, clay, pixel, sketch } from './image-filter';
import { presentation } from './presentation';

export const WorkflowGraphList: WorkflowGraphs = [
  brainstorm,
  presentation,
  sketch,
  clay,
  anime,
  pixel,
];
