import type { TldrawApp } from '@toeverything/components/board-state';
import { BaseSessionType } from '@toeverything/components/board-types';

export abstract class BaseSession extends BaseSessionType {
    app: TldrawApp;
    constructor(app: TldrawApp) {
        super();
        this.app = app;
    }
}
