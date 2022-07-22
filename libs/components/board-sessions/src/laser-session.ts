import { Vec } from '@tldraw/vec';
import {
    SessionType,
    TDStatus,
    TldrawPatch,
    TldrawCommand,
} from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';
import { BaseSession } from './base-session';
export class LaserSession extends BaseSession {
    type = SessionType.Draw;
    performanceMode: any = undefined;
    status = TDStatus.Creating;
    prevPoint: number[];
    prevEraseShapesSize = 0;

    constructor(app: TldrawApp) {
        super(app);
        this.prevPoint = [...app.originPoint];
        this.interval = this.loop();
    }

    interval: any;
    timestamp1 = 0;
    timestamp2 = 0;
    prevErasePoint: number[] = [];

    loop = () => {
        const now = Date.now();
        const elapsed1 = now - this.timestamp1;
        const elapsed2 = now - this.timestamp2;
        const { laserLine } = this.app.appState;

        let next = [...laserLine];
        let didUpdate = false;

        if (elapsed1 > 16 && this.prevErasePoint !== this.prevPoint) {
            didUpdate = true;
            next = [...laserLine, this.prevPoint];
            this.prevErasePoint = this.prevPoint;
        }

        if (elapsed2 > 32) {
            if (next.length > 1) {
                didUpdate = true;
                next.splice(0, Math.ceil(next.length * 0.1));
                this.timestamp2 = now;
            }
        }

        if (didUpdate) {
            this.app.patchState(
                {
                    appState: {
                        laserLine: next,
                    },
                },
                'eraseline'
            );
        }

        this.interval = requestAnimationFrame(this.loop);
    };

    start = (): TldrawPatch | undefined => void null;

    update = (): TldrawPatch | undefined => {
        const { originPoint, currentPoint } = this.app;

        const newPoint = Vec.toFixed(
            Vec.add(originPoint, Vec.sub(currentPoint, originPoint))
        );

        this.prevPoint = newPoint;

        return {};
    };

    cancel = (): TldrawPatch | undefined => {
        cancelAnimationFrame(this.interval);
        return {
            appState: {
                laserLine: [],
            },
        };
    };

    complete = (): TldrawPatch | TldrawCommand | undefined => {
        const { page } = this.app;

        cancelAnimationFrame(this.interval);

        return {
            before: {
                appState: {
                    laserLine: [],
                },
            },
            after: {
                appState: {
                    laserLine: [],
                },
            },
        };
    };
}
