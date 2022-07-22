import type { TldrawApp } from '@toeverything/components/board-state';
import type { TDShape } from '@toeverything/components/board-types';
import { TDShapeType } from '@toeverything/components/board-types';
import { TLDR } from '@toeverything/components/board-state';

interface Config {
    type: 'stroke' | 'fill' | 'font' | 'group' | 'ungroup' | 'deleteShapes';
    selectedShapes: TDShape[];
}

const _createInitConfig = (): Record<Config['type'], Config> => {
    return {
        fill: {
            type: 'fill',
            selectedShapes: [],
        },
        stroke: {
            type: 'stroke',
            selectedShapes: [],
        },
        font: {
            type: 'font',
            selectedShapes: [],
        },
        group: {
            type: 'group',
            selectedShapes: [],
        },
        ungroup: {
            type: 'ungroup',
            selectedShapes: [],
        },
        deleteShapes: {
            type: 'deleteShapes',
            selectedShapes: [],
        },
    };
};

const _isSupportStroke = (shape: TDShape): boolean => {
    return [
        TDShapeType.Rectangle,
        TDShapeType.Ellipse,
        TDShapeType.Hexagon,
        TDShapeType.Triangle,
        TDShapeType.WhiteArrow,
        TDShapeType.Pentagram,
        TDShapeType.Pencil,
        TDShapeType.Laser,
        TDShapeType.Highlight,
        TDShapeType.Arrow,
        TDShapeType.Line,
    ].some(type => type === shape.type);
};

const _isSupportFill = (shape: TDShape): boolean => {
    return [
        TDShapeType.Rectangle,
        TDShapeType.Ellipse,
        TDShapeType.Hexagon,
        TDShapeType.Triangle,
        TDShapeType.WhiteArrow,
        TDShapeType.Pentagram,
    ].some(type => type === shape.type);
};

export const useConfig = (app: TldrawApp): Record<Config['type'], Config> => {
    const state = app.useStore();
    const selectedShapes = TLDR.get_selected_shapes(state, app.currentPageId);
    const config = selectedShapes.reduce<Record<Config['type'], Config>>(
        (acc, cur) => {
            if (_isSupportStroke(cur)) {
                acc.stroke.selectedShapes.push(cur);
            }
            if (_isSupportFill(cur)) {
                acc.fill.selectedShapes.push(cur);
                acc.font.selectedShapes.push(cur);
            }
            return acc;
        },
        _createInitConfig()
    );

    if (
        selectedShapes.length === 1 &&
        selectedShapes[0].type === TDShapeType.Group
    ) {
        config.ungroup.selectedShapes = selectedShapes;
    }
    if (selectedShapes.length > 1) {
        config.group.selectedShapes = selectedShapes;
    }

    config.deleteShapes.selectedShapes = selectedShapes;

    return config;
};

export const getShapeIds = (shapes?: TDShape[]): string[] => {
    return (shapes || []).map(shape => shape.id).filter(id => !!id);
};
