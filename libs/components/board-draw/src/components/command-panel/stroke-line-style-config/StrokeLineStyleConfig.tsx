import type { TldrawApp } from '@toeverything/components/board-state';
import { DashStyle, StrokeWidth } from '@toeverything/components/board-types';
import type { TDShape } from '@toeverything/components/board-types';
import { Popover, IconButton, Tooltip } from '@toeverything/components/ui';
import { BrushIcon } from '@toeverything/components/icons';
import { countBy, maxBy } from '@toeverything/utils';
import { getShapeIds } from '../utils';
import { LineStyle, lineStyles } from './LineStyle';

const _getStrokeStyle = (shapes: TDShape[]): DashStyle => {
    const counted = countBy(shapes, shape => shape.style.dash);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return max[0] as DashStyle;
};

const _getStrokeWidth = (shapes: TDShape[]): StrokeWidth => {
    const counted = countBy(shapes, shape => shape.style.strokeWidth);
    const max = maxBy(Object.entries(counted), ([c, n]) => n);
    return Number(max[0]) as StrokeWidth;
};
interface BorderColorConfigProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const StrokeLineStyleConfig = ({
    app,
    shapes,
}: BorderColorConfigProps) => {
    const strokeStyle = _getStrokeStyle(shapes);
    const strokeWidth = _getStrokeWidth(shapes);
    const setStrokeLineStyle = (style: DashStyle) => {
        app.style(
            {
                dash: style,
            },
            getShapeIds(shapes)
        );
    };
    const setStrokeLineWidth = (width: StrokeWidth) => {
        app.style(
            {
                strokeWidth: width,
            },
            getShapeIds(shapes)
        );
    };

    const icon = lineStyles.find(style => style.value === strokeStyle)
        ?.icon || <BrushIcon />;

    return (
        <Popover
            trigger="hover"
            placement="bottom-start"
            content={
                <LineStyle
                    strokeStyle={strokeStyle}
                    onStrokeStyleChange={setStrokeLineStyle}
                    strokeWidth={strokeWidth}
                    onStrokeWidthChange={setStrokeLineWidth}
                />
            }
        >
            <Tooltip placement="top-start" content="Stroke Style">
                <IconButton>{icon}</IconButton>
            </Tooltip>
        </Popover>
    );
};
