import type { FC } from 'react';
import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { Popover, Tooltip, IconButton } from '@toeverything/components/ui';
import {
    BorderColorNoneIcon,
    BorderColorDuotoneIcon,
} from '@toeverything/components/icons';
import { countBy, maxBy } from '@toeverything/utils';
import { getShapeIds } from './utils';
import { Palette } from '../palette';

interface BorderColorConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

const _colors = [
    'none',
    '#F1675E',
    '#FF7F22',
    '#FFCB45',
    '#40DF9B',
    '#13D9E3',
    '#3E6FDB',
    '#7352F1',
    '#3A4C5C',
    '#FFFFFF',
];

const _getIconRenderColor = (shapes: TDShape[]) => {
    const counted = countBy(shapes, shape => shape.style.stroke);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return max[0];
};

export const BorderColorConfig: FC<BorderColorConfigProps> = ({
    app,
    shapes,
}) => {
    const setBorderColor = (color: string) => {
        app.style({ stroke: color }, getShapeIds(shapes));
    };

    const iconColor = _getIconRenderColor(shapes);

    return (
        <Popover
            trigger="hover"
            placement="bottom-start"
            content={
                <Palette
                    colors={_colors}
                    selected={iconColor}
                    onSelect={setBorderColor}
                />
            }
        >
            <Tooltip content="Border Color" placement="top-start">
                <IconButton>
                    {iconColor === 'none' ? (
                        <BorderColorNoneIcon />
                    ) : (
                        <BorderColorDuotoneIcon style={{ color: iconColor }} />
                    )}
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
