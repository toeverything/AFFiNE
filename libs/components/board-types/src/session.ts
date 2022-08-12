import { TLPerformanceMode } from '@tldraw/core';
import { Patch, TDSnapshot } from './types';

export enum SessionType {
    Transform = 'transform',
    Translate = 'translate',
    TransformSingle = 'transformSingle',
    Brush = 'brush',
    Arrow = 'arrow',
    Draw = 'draw',
    Laser = 'laser',
    Erase = 'erase',
    Rotate = 'rotate',
    Handle = 'handle',
    Grid = 'grid',
}

export interface Command<T extends { [key: string]: any }> {
    id?: string;
    before: Patch<T>;
    after: Patch<T>;
}

export type TldrawPatch = Patch<TDSnapshot>;

export type TldrawCommand = Command<TDSnapshot>;

export abstract class BaseSessionType {
    abstract type: SessionType;
    abstract performanceMode: TLPerformanceMode | undefined;
    abstract start: () => TldrawPatch | undefined;
    abstract update: () => TldrawPatch | undefined;
    abstract complete: () => TldrawPatch | TldrawCommand | undefined;
    abstract cancel: () => TldrawPatch | undefined;
}
