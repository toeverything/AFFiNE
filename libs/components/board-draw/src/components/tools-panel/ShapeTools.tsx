import { FC, useState, useEffect } from 'react';
import {
    ShapeIcon,
    RectangleIcon,
    EllipseIcon,
    TriangleIcon,
    PolygonIcon,
    StarIcon,
    ArrowIcon,
} from '@toeverything/components/icons';
import {
    Tooltip,
    Popover,
    IconButton,
    styled,
} from '@toeverything/components/ui';

import { TDSnapshot, TDShapeType } from '@toeverything/components/board-types';
import { TldrawApp } from '@toeverything/components/board-state';

export type ShapeTypes =
    | TDShapeType.Rectangle
    | TDShapeType.Ellipse
    | TDShapeType.Triangle
    | TDShapeType.Line
    | TDShapeType.Hexagon
    | TDShapeType.Pentagram
    | TDShapeType.WhiteArrow
    | TDShapeType.Arrow;

const shapes = [
    {
        type: TDShapeType.Rectangle,
        label: 'Rectangle',
        tooltip: 'Rectangle',
        icon: RectangleIcon,
    },
    {
        type: TDShapeType.WhiteArrow,
        label: 'WhiteArrow',
        tooltip: 'WhiteArrow',
        icon: ArrowIcon,
    },
    {
        type: TDShapeType.Triangle,
        label: 'Triangle',
        tooltip: 'Triangle',
        icon: TriangleIcon,
    },
    {
        type: TDShapeType.Hexagon,
        label: 'InvertedTranslate',
        tooltip: 'InvertedTranslate',
        icon: PolygonIcon,
    },
    {
        type: TDShapeType.Pentagram,
        label: 'Pentagram',
        tooltip: 'Pentagram',
        icon: StarIcon,
    },
    {
        type: TDShapeType.Ellipse,
        label: 'Ellipse',
        tooltip: 'Ellipse',
        icon: EllipseIcon,
    },
] as const;

const activeToolSelector = (s: TDSnapshot) => s.appState.activeTool;

export const ShapeTools = ({ app }: { app: TldrawApp }) => {
    const activeTool = app.useStore(activeToolSelector);

    const [lastActiveTool, setLastActiveTool] = useState<ShapeTypes>(
        TDShapeType.Rectangle
    );

    useEffect(() => {
        if (
            shapes.find(s => s.type === activeTool) &&
            lastActiveTool !== activeTool
        ) {
            setLastActiveTool(activeTool as ShapeTypes);
        }
    }, [activeTool, lastActiveTool]);

    return (
        <Popover
            placement="right-start"
            trigger="click"
            content={
                <ShapesContainer>
                    {shapes.map(({ type, label, tooltip, icon: Icon }) => (
                        <Tooltip content={tooltip} key={type} placement="right">
                            <IconButton
                                onClick={() => {
                                    app.selectTool(type);
                                    setLastActiveTool(type);
                                }}
                            >
                                <Icon />
                            </IconButton>
                        </Tooltip>
                    ))}
                </ShapesContainer>
            }
        >
            <Tooltip content="Shapes" placement="right" trigger="hover">
                <IconButton aria-label="Shapes">
                    <ShapeIcon />
                </IconButton>
            </Tooltip>
        </Popover>
    );
};

const ShapesContainer = styled('div')({
    width: '64px',
    display: 'flex',
    flexWrap: 'wrap',
});
