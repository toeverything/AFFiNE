import { BlockImplInstance, ChangedStates } from '@toeverything/datasource/jwt';

export type ObserveCallback = (
    changeStates: ChangedStates,
    block: BlockImplInstance
) => void;
export type ReturnUnobserve = () => void;

type ObserverStatus = {
    status: 'observing' | 'removing' | 'none';
    callbacks: ObserveCallback[];
};

export class ObserverManager {
    private observe_callbacks: Record<string, ObserverStatus | undefined> = {};
    addCallback(key: string, callback: ObserveCallback) {
        if (!this.observe_callbacks[key]) {
            this.observe_callbacks[key] = {
                status: 'none',
                callbacks: [],
            };
        }

        const observer = this.observe_callbacks[key] as ObserverStatus;
        observer.callbacks.push(callback);
        return () => {
            const index = observer.callbacks.indexOf(callback);
            if (index > -1) {
                observer.callbacks.splice(index, 1);
            }
        };
    }
    removeCallback(key: string, callback?: ObserveCallback) {
        const observer = this.observe_callbacks[key];
        if (!observer) {
            return;
        }
        if (callback) {
            const index = observer.callbacks.indexOf(callback);
            if (index > -1) {
                observer.callbacks.splice(index, 1);
            }
        } else {
            observer.callbacks = [];
        }
    }
    getCallbacks(key: string) {
        return this.observe_callbacks[key]?.callbacks || [];
    }
    getStatus(key: string) {
        return this.observe_callbacks[key]?.status || 'none';
    }
    setStatus(key: string, status: 'observing' | 'removing' | 'none') {
        if (!this.observe_callbacks[key]) {
            this.observe_callbacks[key] = {
                status: 'none',
                callbacks: [],
            };
        }
        (this.observe_callbacks[key] as ObserverStatus).status = status;
    }
    removeObserve(key: string) {
        this.observe_callbacks[key] = undefined;
    }
}

export function getObserverName(workspace: string, blockId: string) {
    return `${workspace}_${blockId}`;
}
