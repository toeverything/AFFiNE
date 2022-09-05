import {
    ConectorArrowIcon,
    ConectorLineIcon,
    ConnectorIcon,
} from '@toeverything/components/icons';
import {
    IconButton,
    Popover,
    styled,
    Tooltip,
} from '@toeverything/components/ui';
import { useEffect, useState } from 'react';

import { TldrawApp } from '@toeverything/components/board-state';
import { TDShapeType, TDSnapshot } from '@toeverything/components/board-types';

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

export const LineTools = ({ app }: { app: TldrawApp }) => {
    const activeTool = app.useStore(activeToolSelector);
    const [visible, setVisible] = useState(false);

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
            visible={visible}
            placement="right-start"
            onClick={() => setVisible(prev => !prev)}
            onClickAway={() => setVisible(false)}
            content={
                <ShapesContainer>
                    {shapes.map(({ type, label, tooltip, icon: Icon }) => (
                        <Tooltip content={tooltip} key={type} placement="right">
                            <IconButton
                                onClick={() => {
                                    app.selectTool(type);
                                    setVisible(false);
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
