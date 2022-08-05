import { debounce } from 'ts-debounce';

import { getLogger } from './index';

declare const JWT_DEV: boolean;

const logger = getLogger('BlockDB:event_bus');

export class BlockEventBus {
    private readonly _eventBus: EventTarget;
    private readonly _eventCallbackCache: Map<string, any>;
    private readonly _scopedCache: Map<string, BlockScopedEventBus<any>>;

    constructor(event_bus?: EventTarget) {
        this._eventBus = event_bus || new EventTarget();
        this._eventCallbackCache = new Map();
        this._scopedCache = new Map();
    }

    protected on_listener(
        topic: string,
        name: string,
        listener: (e: Event) => void
    ) {
        const handler_name = `${topic}/${name}`;
        if (!this._eventCallbackCache.has(handler_name)) {
            this._eventBus.addEventListener(topic, listener);
            this._eventCallbackCache.set(handler_name, listener);
        } else {
            JWT_DEV && logger(`event handler ${handler_name} is existing`);
        }
    }

    protected off_listener(topic: string, name: string) {
        const handler_name = `${topic}/${name}`;
        const listener = this._eventCallbackCache.get(handler_name);
        if (listener) {
            this._eventBus.removeEventListener(topic, listener);
            this._eventCallbackCache.delete(handler_name);
        } else {
            JWT_DEV && logger(`event handler ${handler_name} is not existing`);
        }
    }

    protected has_listener(topic: string, name: string) {
        return this._eventCallbackCache.has(`${topic}/${name}`);
    }

    protected emit_event<T>(topic: string, detail?: T) {
        this._eventBus.dispatchEvent(new CustomEvent(topic, { detail }));
    }

    topic<T = unknown>(topic: string): BlockScopedEventBus<T> {
        return (
            this._scopedCache.get(topic) ||
            new BlockScopedEventBus<T>(topic, this._eventBus)
        );
    }
}

type DebounceOptions = {
    wait: number;
    maxWait?: number;
};

type ListenerOptions = {
    debounce?: DebounceOptions;
};

class BlockScopedEventBus<T> extends BlockEventBus {
    private readonly _topic: string;

    constructor(topic: string, event_bus?: EventTarget) {
        super(event_bus);
        this._topic = topic;
    }

    on(
        name: string,
        listener: ((e: T) => Promise<void>) | ((e: T) => void),
        options?: ListenerOptions
    ) {
        if (options?.debounce) {
            const { wait, maxWait } = options.debounce;
            const debounced = debounce(listener, wait, { maxWait });
            this.on_listener(this._topic, name, e => {
                debounced((e as CustomEvent)?.detail);
            });
        } else {
            this.on_listener(this._topic, name, e => {
                listener((e as CustomEvent)?.detail);
            });
        }
    }

    off(name: string) {
        this.off_listener(this._topic, name);
    }

    has(name: string) {
        return this.has_listener(this._topic, name);
    }

    emit(detail?: T) {
        this.emit_event(this._topic, detail);
    }
}
