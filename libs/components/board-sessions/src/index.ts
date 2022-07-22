import { ExceptFirst, SessionType } from '@toeverything/components/board-types';
import { ArrowSession } from './arrow-session';
import { BrushSession } from './brush-session';
import { DrawSession } from './draw-session';
import { HandleSession } from './handle-session';
import { RotateSession } from './rotate-session';
import { TransformSession } from './transform-session';
import { TransformSingleSession } from './transform-single-session';
import { TranslateSession } from './translate-session';
import { EraseSession } from './erase-session';
import { GridSession } from './grid-session';
import { LaserSession } from './laser-session';

export type TldrawSession =
    | ArrowSession
    | BrushSession
    | DrawSession
    | HandleSession
    | RotateSession
    | TransformSession
    | TransformSingleSession
    | TranslateSession
    | EraseSession
    | GridSession;

export interface SessionsMap {
    [SessionType.Arrow]: typeof ArrowSession;
    [SessionType.Brush]: typeof BrushSession;
    [SessionType.Draw]: typeof DrawSession;
    [SessionType.Laser]: typeof LaserSession;
    [SessionType.Erase]: typeof EraseSession;
    [SessionType.Handle]: typeof HandleSession;
    [SessionType.Rotate]: typeof RotateSession;
    [SessionType.Transform]: typeof TransformSession;
    [SessionType.TransformSingle]: typeof TransformSingleSession;
    [SessionType.Translate]: typeof TranslateSession;
    [SessionType.Grid]: typeof GridSession;
}

export type SessionOfType<K extends SessionType> = SessionsMap[K];

export type SessionArgsOfType<K extends SessionType> = ExceptFirst<
    ConstructorParameters<SessionOfType<K>>
>;

export const sessions: { [K in SessionType]: SessionsMap[K] } = {
    [SessionType.Arrow]: ArrowSession,
    [SessionType.Brush]: BrushSession,
    [SessionType.Draw]: DrawSession,
    [SessionType.Laser]: LaserSession,
    [SessionType.Erase]: EraseSession,
    [SessionType.Handle]: HandleSession,
    [SessionType.Rotate]: RotateSession,
    [SessionType.Transform]: TransformSession,
    [SessionType.TransformSingle]: TransformSingleSession,
    [SessionType.Translate]: TranslateSession,
    [SessionType.Grid]: GridSession,
};

export const getSession = <K extends SessionType>(
    type: K
): SessionOfType<K> => {
    return sessions[type];
};
