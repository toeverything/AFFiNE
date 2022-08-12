import { FC } from 'react';
import style9 from 'style9';
import {
    // MuiIconButton as IconButton,
    // MuiTooltip as Tooltip,
    Tooltip,
    PopoverContainer,
    IconButton,
    useTheme,
} from '@toeverything/components/ui';
import {
    FrameIcon,
    HandToolIcon,
    SelectIcon,
    TextIcon,
    EraserIcon,
} from '@toeverything/components/icons';

import {
    TDSnapshot,
    TDShapeType,
    TDToolType,
} from '@toeverything/components/board-types';
import { TldrawApp } from '@toeverything/components/board-state';

import { ShapeTools } from './ShapeTools';
import { PenTools } from './pen-tools';
import { LineTools } from './LineTools';

const activeToolSelector = (s: TDSnapshot) => s.appState.activeTool;
const toolLockedSelector = (s: TDSnapshot) => s.appState.isToolLocked;

const tools: Array<{
    type: string;
    label?: string;
    tooltip?: string;
    icon?: FC;
    component?: FC<{ app: TldrawApp }>;
}> = [
    {
        type: 'select',
        label: 'Select',
        tooltip: 'Select',
        icon: SelectIcon,
    },
    { type: 'frame', label: 'Frame', tooltip: 'Frame', icon: FrameIcon },
    {
        type: TDShapeType.Editor,
        label: 'Text',
        tooltip: 'Text',
        icon: TextIcon,
    },
    { type: 'shapes', component: ShapeTools },
    { type: 'draw', component: PenTools },
    { type: 'Connector', component: LineTools },
    // { type: 'erase', label: 'Erase', tooltip: 'Erase', icon: EraseIcon },
    {
        type: TDShapeType.HandDraw,
        label: 'HandDraw',
        tooltip: 'HandDraw',
        icon: HandToolIcon,
    },
    {
        type: 'erase',
        label: 'Eraser',
        tooltip: 'Eraser',
        icon: EraserIcon,
    },
];

export const ToolsPanel = ({ app }: { app: TldrawApp }) => {
    const activeTool = app.useStore(activeToolSelector);

    const isToolLocked = app.useStore(toolLockedSelector);
    const theme = useTheme();

    return (
        <PopoverContainer
            style={{
                position: 'absolute',
                left: '10px',
                top: '40%',
                transform: 'translateY(-50%)',
            }}
            direction="none"
        >
            <div className={styles('container')}>
                <div className={styles('toolBar')}>
                    {tools.map(
                        ({
                            type,
                            label,
                            tooltip,
                            icon: Icon,
                            component: Component,
                        }) =>
                            Component ? (
                                <Component key={type} app={app} />
                            ) : (
                                <Tooltip
                                    content={tooltip}
                                    key={type}
                                    placement="right"
                                >
                                    <IconButton
                                        aria-label={label}
                                        style={{
                                            color:
                                                activeTool === type
                                                    ? theme.affine.palette
                                                          .primary
                                                    : '',
                                        }}
                                        onClick={() => {
                                            app.selectTool(type as TDToolType);
                                        }}
                                        disabled={isToolLocked}
                                    >
                                        <Icon />
                                    </IconButton>
                                </Tooltip>
                            )
                    )}
                </div>
            </div>
        </PopoverContainer>
    );
};

const styles = style9.create({
    container: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100%',
    },
    toolBar: {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        borderRadius: '10px',
        padding: '4px 4px',
    },
});
