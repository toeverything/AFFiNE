export type SliderRange = {
  /**
   * a series of points in slider
   */
  points: number[];
  /**
   * whether the points are uniformly distributed
   * @default true
   */
  uniform?: boolean;
};

export type SliderStyle = {
  width: string;
  itemSize: number;
  itemIconSize: number;
  dragHandleSize: number;
};

export type SliderSelectEvent = CustomEvent<{
  value: number;
}>;
