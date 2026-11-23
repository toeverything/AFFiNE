import type { ShapeToolOption } from '@blocksuite/affine-gfx-shape';
import { ShapeType } from '@blocksuite/affine-model';
import {
  DiamondIcon,
  EllipseIcon,
  RoundedRectangleIcon,
  SquareIcon,
  TriangleIcon,
} from '@blocksuite/icons/lit';
import type { TemplateResult } from 'lit';

import {
  ScribbledDiamondIcon,
  ScribbledEllipseIcon,
  ScribbledRoundedRectangleIcon,
  ScribbledSquareIcon,
  ScribbledTriangleIcon,
} from './icons';

type Config = {
  name: ShapeToolOption['shapeName'];
  generalIcon: TemplateResult<1>;
  scribbledIcon: TemplateResult<1>;
  tooltip: string;
  disabled: boolean;
};

export const ShapeComponentConfig: Config[] = [
  {
    name: ShapeType.Rect,
    generalIcon: SquareIcon(),
    scribbledIcon: ScribbledSquareIcon,
    tooltip: 'Square',
    disabled: false,
  },
  {
    name: ShapeType.Ellipse,
    generalIcon: EllipseIcon(),
    scribbledIcon: ScribbledEllipseIcon,
    tooltip: 'Ellipse',
    disabled: false,
  },
  {
    name: ShapeType.Diamond,
    generalIcon: DiamondIcon(),
    scribbledIcon: ScribbledDiamondIcon,
    tooltip: 'Diamond',
    disabled: false,
  },
  {
    name: ShapeType.Triangle,
    generalIcon: TriangleIcon(),
    scribbledIcon: ScribbledTriangleIcon,
    tooltip: 'Triangle',
    disabled: false,
  },
  {
    name: 'roundedRect',
    generalIcon: RoundedRectangleIcon(),
    scribbledIcon: ScribbledRoundedRectangleIcon,
    tooltip: 'Rounded rectangle',
    disabled: false,
  },
];

export const ShapeComponentConfigMap = ShapeComponentConfig.reduce(
  (acc, config) => {
    acc[config.name] = config;
    return acc;
  },
  {} as Record<Config['name'], Config>
);
