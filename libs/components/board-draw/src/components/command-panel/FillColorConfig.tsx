import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import {
    ShapeColorDuotoneIcon,
    ShapeColorNoneIcon,
} from '@toeverything/components/icons';
import {
    IconButton,
    Popover,
    Tooltip,
    useTheme,
} from '@toeverything/components/ui';
import { countBy, maxBy } from '@toeverything/utils';
import { Palette } from '../palette';
import { getShapeIds } from './utils';

interface BorderColorConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

type ColorType = 'none' | string;

const _colors: ColorType[] = [
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
    const counted = countBy(shapes, shape => shape.style.fill);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return max[0];
};

export const FillColorConfig = ({ app, shapes }: BorderColorConfigProps) => {
    const theme = useTheme();
    const setFillColor = (color: ColorType) => {
        app.style(
            { fill: color, isFilled: color !== 'none' },
            getShapeIds(shapes)
        );
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
                    onSelect={setFillColor}
                />
            }
        >
            <Tooltip content="Fill Color" placement="top-start">
                <IconButton>
                    {iconColor === 'none' ? (
                        <ShapeColorNoneIcon />
                    ) : (
                        <ShapeColorDuotoneIcon
                            style={{
                                color: iconColor,
                                border:
                                    iconColor === '#FFFFFF'
                                        ? `1px solid ${theme.affine.palette.tagHover}`
                                        : 0,
                                borderRadius: '5px',
                            }}
                        />
                    )}
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
