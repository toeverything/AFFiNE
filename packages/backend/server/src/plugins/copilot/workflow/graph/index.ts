import type { WorkflowGraphs } from '../types';
import { brainstorm } from './brainstorm';
import { anime, clay, pixel, sketch } from './image-filter';
import { makeItReal } from './make-it-real';
import { presentation } from './presentation';

export const WorkflowGraphList: WorkflowGraphs = [
  brainstorm,
  presentation,
  makeItReal, // 添加新的工作流
  sketch,
  clay,
  anime,
  pixel,
];
