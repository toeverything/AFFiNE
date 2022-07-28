import type { TLBounds } from '@tldraw/core';
import type { TldrawApp } from '../tldraw-app';
import type {
    TldrawCommand,
    AlignType,
    TDShape,
    TDBinding,
    DistributeType,
    FlipType,
    MoveType,
    StretchType,
    ShapeStyles,
    GroupShape,
} from '@toeverything/components/board-types';

export interface Commands {
    alignShapes(app: TldrawApp, ids: string[], type: AlignType): TldrawCommand;
    changePage(app: TldrawApp, pageId: string): TldrawCommand;
    createPage(
        app: TldrawApp,
        center: number[],
        pageId?: string
    ): TldrawCommand;
    createShapes(
        app: TldrawApp,
        shapes: TDShape[],
        bindings: TDBinding[]
    ): TldrawCommand;
    deletePage(app: TldrawApp, pageId: string): TldrawCommand;
    deleteShapes(app: TldrawApp, ids: string[], pageId?: string): TldrawCommand;
    distributeShapes(
        app: TldrawApp,
        ids: string[],
        type: DistributeType
    ): TldrawCommand;
    duplicatePage(app: TldrawApp, pageId: string): TldrawCommand;
    duplicateShapes(
        app: TldrawApp,
        ids: string[],
        point?: number[]
    ): TldrawCommand;
    flipShapes(app: TldrawApp, ids: string[], type: FlipType): TldrawCommand;
    groupShapes(
        app: TldrawApp,
        ids: string[],
        groupId: string,
        pageId: string
    ): TldrawCommand | undefined;
    moveShapesToPage(
        app: TldrawApp,
        ids: string[],
        viewportBounds: TLBounds,
        fromPageId: string,
        toPageId: string
    ): TldrawCommand;
    renamePage(app: TldrawApp, pageId: string, name: string): TldrawCommand;
    reorderShapes(app: TldrawApp, ids: string[], type: MoveType): TldrawCommand;
    resetBounds(app: TldrawApp, ids: string[], pageId: string): TldrawCommand;
    rotateShapes(
        app: TldrawApp,
        ids: string[],
        delta: number
    ): TldrawCommand | void;
    setShapesProps<T extends TDShape>(
        app: TldrawApp,
        ids: string[],
        partial: Partial<T>
    ): TldrawCommand;
    stretchShapes(
        app: TldrawApp,
        ids: string[],
        type: StretchType
    ): TldrawCommand;
    styleShapes(
        app: TldrawApp,
        ids: string[],
        changes: Partial<ShapeStyles>
    ): TldrawCommand;
    toggleShapesDecoration(
        app: TldrawApp,
        ids: string[],
        decorationId: 'start' | 'end'
    ): TldrawCommand;
    toggleShapesProp(
        app: TldrawApp,
        ids: string[],
        prop: keyof TDShape
    ): TldrawCommand;
    translateShapes(
        app: TldrawApp,
        ids: string[],
        delta: number[]
    ): TldrawCommand;
    ungroupShapes(
        app: TldrawApp,
        selectedIds: string[],
        groupShapes: GroupShape[],
        pageId: string
    ): TldrawCommand | undefined;
    updateShapes(
        app: TldrawApp,
        updates: ({ id: string } & Partial<TDShape>)[],
        pageId: string
    ): TldrawCommand;
    setShapesLockStatus(
        app: TldrawApp,
        ids: string[],
        isLocked: boolean
    ): TldrawCommand;
}
