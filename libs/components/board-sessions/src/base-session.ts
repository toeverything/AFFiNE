import { BaseSessionType } from '@toeverything/components/board-types';
import type { TldrawApp } from '@toeverything/components/board-state';

export abstract class BaseSession extends BaseSessionType {
    app: TldrawApp;
    constructor(app: TldrawApp) {
        super();
        this.app = app;
    }
}
