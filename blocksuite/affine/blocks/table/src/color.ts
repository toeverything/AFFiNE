import { cssVarV2 } from '@blocksuite/affine-shared/theme';
type Color = {
  name: string;
  color: string;
};
export const colorList: Color[] = [
  {
    name: 'Blue',
    color: cssVarV2.table.headerBackground.blue,
  },
  {
    name: 'Green',
    color: cssVarV2.table.headerBackground.green,
  },
  {
    name: 'Grey',
    color: cssVarV2.table.headerBackground.grey,
  },
  {
    name: 'Orange',
    color: cssVarV2.table.headerBackground.orange,
  },
  {
    name: 'Purple',
    color: cssVarV2.table.headerBackground.purple,
  },
  {
    name: 'Red',
    color: cssVarV2.table.headerBackground.red,
  },
  {
    name: 'Teal',
    color: cssVarV2.table.headerBackground.teal,
  },
  {
    name: 'Yellow',
    color: cssVarV2.table.headerBackground.yellow,
  },
];

const colorMap = Object.fromEntries(colorList.map(item => [item.color, item]));

export const getColorByColor = (color: string): Color | undefined => {
  return colorMap[color] ?? undefined;
};
