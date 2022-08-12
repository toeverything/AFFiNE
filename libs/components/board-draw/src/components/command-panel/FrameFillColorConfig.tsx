import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import {
    Popover,
    Tooltip,
    IconButton,
    useTheme,
} from '@toeverything/components/ui';
import {
    ShapeColorNoneIcon,
    ShapeColorDuotoneIcon,
} from '@toeverything/components/icons';
import { countBy, maxBy } from '@toeverything/utils';
import { getShapeIds } from './utils';
import { Palette } from '../palette';

interface BorderColorConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

type ColorType = 'none' | string;

const _colors: ColorType[] = [
    'rgba(255, 133, 137, 0.5)',
    'rgba(255, 159, 101, 0.5)',
    'rgba(255, 251, 69, 0.5)',
    'rgba(64, 255, 138, 0.5)',
    'rgba(26, 252, 255, 0.5)',
    'rgba(198, 156, 255, 0.5)',
    'rgba(255, 143, 224, 0.5)',
    'rgba(152, 172, 189, 0.5)',
    'rgba(216, 226, 248, 0.5)',
];

const _getIconRenderColor = (shapes: TDShape[]) => {
    const counted = countBy(shapes, shape => shape.style.fill);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return max[0];
};

export const FrameFillColorConfig = ({
    app,
    shapes,
}: BorderColorConfigProps) => {
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
            <Tooltip content="Frame Background Color" placement="top-start">
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
