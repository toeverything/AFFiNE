export type SketchElementType =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'image';

export type SketchElement = {
  id: string;
  type: SketchElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  points?: number[][];
  isDeleted?: boolean;
};

export type SketchScene = {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: SketchElement[];
  appState: {
    viewBackgroundColor: string;
  };
  files: Record<string, unknown>;
};

export type SketchAssets = Record<string, string>;
