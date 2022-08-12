import { Utils } from '@tldraw/core';
import Vec from '@tldraw/vec';
import { TLDR } from '@toeverything/components/board-state';
import { styled } from '@toeverything/components/ui';
import { useTldrawApp } from '../../../hooks';

import { getViewportBound, processBound } from './bounds';
import { SimplifiedShape } from './SimplifiedShape';
import { Viewport } from './Viewport';

const MINI_MAP_WIDTH = 150;
const MINI_MAP_HEIGHT = 100;

const getScaleToMap = (width: number, height: number) => {
    const scaleWidth = width / MINI_MAP_WIDTH;
    const scaleHeight = height / MINI_MAP_HEIGHT;
    return scaleWidth > scaleHeight ? scaleWidth : scaleHeight;
};

export const MiniMap = () => {
    const app = useTldrawApp();
    const page = app.useStore(s => s.document.pages[s.appState.currentPageId]);
    const pageState = app.useStore(
        s => s.document.pageStates[s.appState.currentPageId]
    );
    const viewportBound = getViewportBound(
        app.rendererBounds,
        pageState.camera
    );

    const shapes = Object.values(page.shapes);
    const bounds = shapes.map(shape => TLDR.get_bounds(shape));
    const commonBound = Utils.getCommonBounds(bounds.concat(viewportBound));
    const scaleToMap = commonBound
        ? getScaleToMap(commonBound.width, commonBound.height)
        : 1;
    const processedViewportBound = processBound({
        bound: viewportBound,
        scale: scaleToMap,
        commonBound,
    });

    return (
        <Container>
            <ShapesContainer>
                {shapes.map((shape, index) => {
                    const bound = processBound({
                        bound: bounds[index],
                        scale: scaleToMap,
                        commonBound,
                    });
                    return (
                        <SimplifiedShape
                            key={shape.id}
                            {...bound}
                            onClick={() => {
                                app.zoomToShapes([shape]);
                            }}
                        />
                    );
                })}
                <Viewport
                    {...processedViewportBound}
                    onPan={delta => {
                        app.pan(Vec.mul(delta, scaleToMap));
                    }}
                />
            </ShapesContainer>
        </Container>
    );
};

const Container = styled('div')(({ theme }) => ({
    display: 'inline-block',
    padding: '10px',
    borderColor: theme.affine.palette.borderColor,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '4px',
    backgroundColor: theme.affine.palette.white,
}));

const ShapesContainer = styled('div')({
    position: 'relative',
    width: `${MINI_MAP_WIDTH}px`,
    height: `${MINI_MAP_HEIGHT}px`,
});
