import { drawioLibraryStencilShapes } from './library-stencils.js';
import { drawioStencilShapes } from './stencils.js';

export type StencilCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | {
      cmd: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { cmd: 'Q'; x1: number; y1: number; x: number; y: number }
  | {
      cmd: 'A';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
      x: number;
      y: number;
    }
  | { cmd: 'Z' };

export type StencilShapeData = {
  width: number;
  height: number;
  paths: ReadonlyArray<ReadonlyArray<StencilCommand>>;
  strokes: ReadonlyArray<ReadonlyArray<StencilCommand>>;
  constraints: ReadonlyArray<{
    x: number;
    y: number;
    perimeter: string;
    name: string;
  }>;
};

const allStencilShapes = {
  ...drawioStencilShapes,
  ...drawioLibraryStencilShapes,
} as unknown as Record<string, StencilShapeData>;

export const STENCIL_SHAPE_NAMES = Object.keys(allStencilShapes).sort();

export const getStencilShapeData = (name: string): StencilShapeData | null =>
  allStencilShapes[name] ?? null;

const scale = (value: number, total: number) => value * total;

export const buildPathFromStencil = (
  commands: ReadonlyArray<StencilCommand>,
  width: number,
  height: number
) => {
  const parts: string[] = [];
  for (const command of commands) {
    switch (command.cmd) {
      case 'M':
        parts.push(`M ${scale(command.x, width)} ${scale(command.y, height)}`);
        break;
      case 'L':
        parts.push(`L ${scale(command.x, width)} ${scale(command.y, height)}`);
        break;
      case 'C':
        parts.push(
          `C ${scale(command.x1, width)} ${scale(command.y1, height)} ${scale(command.x2, width)} ${scale(command.y2, height)} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'Q':
        parts.push(
          `Q ${scale(command.x1, width)} ${scale(command.y1, height)} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'A':
        parts.push(
          `A ${scale(command.rx, width)} ${scale(command.ry, height)} ${command.xAxisRotation} ${command.largeArcFlag} ${command.sweepFlag} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
};
