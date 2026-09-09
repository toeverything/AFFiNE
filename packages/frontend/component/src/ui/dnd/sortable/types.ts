export type Transform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export interface ClientRect {
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export type SortingStrategy = (args: {
  activeNodeRect: ClientRect | null;
  activeIndex: number;
  index: number;
  rects: ClientRect[];
  overIndex: number;
}) => Transform | null;

export type UniqueIdentifier = string | number;

export type RectMap = Map<UniqueIdentifier, ClientRect>;

export interface Disabled {
  draggable?: boolean;
  droppable?: boolean;
}
