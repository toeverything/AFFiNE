import type { FC } from 'react';
import { Fragment } from 'react';
import { Vec } from '@tldraw/vec';
import { TldrawApp, TLDR } from '@toeverything/components/board-state';
import { Popover, styled, Divider } from '@toeverything/components/ui';
import { getAnchor, useConfig } from './utils';
import { BorderColorConfig } from './BorderColorConfig';
import { FillColorConfig } from './FillColorConfig';
import { FontSizeConfig } from './FontSizeConfig';
import { StrokeLineStyleConfig } from './stroke-line-style-config';
import { Group, UnGroup } from './GroupOperation';
import { DeleteShapes } from './DeleteOperation';
import { Lock, Unlock } from './LockOperation';
import { FrameFillColorConfig } from './FrameFillColorConfig';

export const CommandPanel: FC<{ app: TldrawApp }> = ({ app }) => {
    const state = app.useStore();
    const bounds = TLDR.get_selected_bounds(state);
    const camera = app.useStore(
        s => s.document.pageStates[s.appState.currentPageId].camera
    );
    const point = bounds
        ? app.getScreenPoint([bounds.minX, bounds.minY])
        : undefined;

    const anchor = getAnchor({
        x: point?.[0] || 0,
        y: (point?.[1] || 0) + 40,
        width: bounds?.width ? bounds.width * camera.zoom : 0,
        height: bounds?.height ? bounds.height * camera.zoom : 0,
    });

    const config = useConfig(app);

    const configNodes = {
        stroke: config.stroke.selectedShapes.length ? (
            <Fragment key="stroke">
                <StrokeLineStyleConfig
                    app={app}
                    shapes={config.stroke.selectedShapes}
                />
                <BorderColorConfig
                    app={app}
                    shapes={config.stroke.selectedShapes}
                />
            </Fragment>
        ) : null,
        fill: config.fill.selectedShapes.length ? (
            <FillColorConfig
                key="fill"
                app={app}
                shapes={config.fill.selectedShapes}
            />
        ) : null,
        frameFill: config.frameFill.selectedShapes.length ? (
            <FrameFillColorConfig
                key="fill"
                app={app}
                shapes={config.frameFill.selectedShapes}
            />
        ) : null,
        font: config.font.selectedShapes.length ? (
            <FontSizeConfig
                key="font"
                app={app}
                shapes={config.font.selectedShapes}
            />
        ) : null,
        group: config.group.selectedShapes.length ? (
            <Group key="group" app={app} shapes={config.group.selectedShapes} />
        ) : null,
        ungroup: config.ungroup.selectedShapes.length ? (
            <UnGroup
                key="ungroup"
                app={app}
                shapes={config.ungroup.selectedShapes}
            />
        ) : null,
        lock: config.lock.selectedShapes.length ? (
            <Lock key="lock" app={app} shapes={config.lock.selectedShapes} />
        ) : null,
        unlock: config.unlock.selectedShapes.length ? (
            <Unlock
                key="unlock"
                app={app}
                shapes={config.unlock.selectedShapes}
            />
        ) : null,
        delete: (
            <DeleteShapes
                key="deleteShapes"
                app={app}
                shapes={config.deleteShapes.selectedShapes}
            />
        ),
    };

    const nodes = Object.entries(configNodes).filter(([key, node]) => !!node);

    return nodes.length ? (
        <Popover
            trigger="click"
            visible={!!point}
            anchor={anchor}
            popoverDirection="none"
            content={
                <PopoverContainer>
                    {nodes.map(([key, node], idx, arr) => {
                        return (
                            <Fragment key={key}>
                                {node}
                                {idx < arr.length - 1 ? (
                                    <div>
                                        <Divider orientation="vertical" />
                                    </div>
                                ) : null}
                            </Fragment>
                        );
                    })}
                </PopoverContainer>
            }
        />
    ) : null;
};

const PopoverContainer = styled('div')({
    display: 'flex',
});
