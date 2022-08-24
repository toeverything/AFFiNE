import { TLDR, TldrawApp } from '@toeverything/components/board-state';
import { Divider, Popover, styled } from '@toeverything/components/ui';
import { Fragment } from 'react';
import { AlignOperation } from './AlignOperation';
import { BorderColorConfig } from './BorderColorConfig';
import { DeleteShapes } from './DeleteOperation';
import { FillColorConfig } from './FillColorConfig';
import { FontSizeConfig } from './FontSizeConfig';
import { FrameFillColorConfig } from './FrameFillColorConfig';
import { Group, UnGroup } from './GroupOperation';
import { Lock, Unlock } from './LockOperation';
import { MoveCoverageConfig } from './MoveCoverage';
import { StrokeLineStyleConfig } from './stroke-line-style-config';
import { getAnchor, useConfig } from './utils';

export const CommandPanel = ({ app }: { app: TldrawApp }) => {
    const state = app.useStore();
    const bounds = TLDR.get_selected_bounds(state);
    const camera = app.useStore(
        s => s.document.pageStates[s.appState.currentPageId].camera
    );
    const point = bounds
        ? app.getScreenPoint([bounds.minX, bounds.minY])
        : undefined;

    const anchorEl = getAnchor({
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
        moveCoverageConfig: (
            <MoveCoverageConfig
                key="deleteShapes1"
                app={app}
                shapes={config.deleteShapes.selectedShapes}
            />
        ),
        alginOperation: config.group.selectedShapes.length ? (
            <AlignOperation
                app={app}
                shapes={config.deleteShapes.selectedShapes}
            ></AlignOperation>
        ) : null,
        // toNextShap: (
        //     <ArrowTo
        //         app={app}
        //         shapes={config.deleteShapes.selectedShapes}
        //     ></ArrowTo>
        // ),
    };

    const nodes = Object.entries(configNodes).filter(([key, node]) => !!node);

    return nodes.length ? (
        <Popover
            trigger="click"
            visible={!!point}
            anchorEl={anchorEl}
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
