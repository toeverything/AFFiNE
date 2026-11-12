import { createEnumMap } from '../utils/enum.js';

export enum ConnectorEndpoint {
  Front = 'Front',
  Rear = 'Rear',
}

export enum PointStyle {
  Arrow = 'Arrow',
  Circle = 'Circle',
  Diamond = 'Diamond',
  None = 'None',
  Triangle = 'Triangle',
  Classic = 'classic',
  ClassicThin = 'classicThin',
  Open = 'open',
  OpenThin = 'openThin',
  Block = 'block',
  BlockThin = 'blockThin',
  Oval = 'oval',
  DiamondThin = 'diamondThin',
  DoubleBlock = 'doubleBlock',
  Box = 'box',
  HalfCircle = 'halfCircle',
  OpenAsync = 'openAsync',
  Async = 'async',
  Dash = 'dash',
  BaseDash = 'baseDash',
  Cross = 'cross',
  CircleOutline = 'circle',
  CirclePlus = 'circlePlus',
  EROne = 'ERone',
  ERMandOne = 'ERmandOne',
  ERMany = 'ERmany',
  EROneToMany = 'ERoneToMany',
  ERZeroToOne = 'ERzeroToOne',
  ERZeroToMany = 'ERzeroToMany',
}

export const PointStyleMap = createEnumMap(PointStyle);

export const DEFAULT_FRONT_ENDPOINT_STYLE = PointStyle.None;

export const DEFAULT_REAR_ENDPOINT_STYLE = PointStyle.Arrow;

export const CONNECTOR_LABEL_MAX_WIDTH = 280;

export enum ConnectorLabelOffsetAnchor {
  Bottom = 'bottom',
  Center = 'center',
  Top = 'top',
}

export enum ConnectorMode {
  Straight,
  Orthogonal,
  Curve,
  Rounded,
}

export const DEFAULT_CONNECTOR_MODE = ConnectorMode.Curve;

// Default radius used for rounded connectors.
export const DEFAULT_CONNECTOR_CORNER_RADIUS = 20;
