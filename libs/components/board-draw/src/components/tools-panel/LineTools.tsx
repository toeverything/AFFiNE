import { FC, useState, useEffect } from 'react';
import {
    ConnectorIcon,
    ConectorLineIcon,
    ConectorArrowIcon,
} from '@toeverything/components/icons';
import {
    Tooltip,
    Popover,
    IconButton,
    styled,
} from '@toeverything/components/ui';

import { TDSnapshot, TDShapeType } from '@toeverything/components/board-types';
import { TldrawApp } from '@toeverything/components/board-state';

export type ShapeTypes = TDShapeType.Line | TDShapeType.Arrow;

const shapes = [
    {
        type: TDShapeType.Line,
        label: 'Line',
        tooltip: 'Line',
        icon: ConectorLineIcon,
    },
    {
        type: TDShapeType.Arrow,
        label: 'Arrow',
        tooltip: 'Arrow',
        icon: ConectorArrowIcon,
    },
] as const;

const activeToolSelector = (s: TDSnapshot) => s.appState.activeTool;

export const LineTools: FC<{ app: TldrawApp }> = ({ app }) => {
    const activeTool = app.useStore(activeToolSelector);

    const [lastActiveTool, setLastActiveTool] = useState<ShapeTypes>(
        TDShapeType.Line
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
            <Tooltip content="Connector" placement="right" trigger="hover">
                <IconButton aria-label="Connector">
                    <ConnectorIcon />
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
