import { debounce } from 'ts-debounce';

import { getLogger } from './index';

declare const JWT_DEV: boolean;

const logger = getLogger('BlockDB:event_bus');

export class BlockEventBus {
    readonly #event_bus: EventTarget;
    readonly #event_callback_cache: Map<string, any>;
    readonly #scoped_cache: Map<string, BlockScopedEventBus<any>>;

    constructor(event_bus?: EventTarget) {
        this.#event_bus = event_bus || new EventTarget();
        this.#event_callback_cache = new Map();
        this.#scoped_cache = new Map();
    }

    protected on_listener(
        topic: string,
        name: string,
        listener: (e: Event) => void
    ) {
        const handler_name = `${topic}/${name}`;
        if (!this.#event_callback_cache.has(handler_name)) {
            this.#event_bus.addEventListener(topic, listener);
            this.#event_callback_cache.set(handler_name, listener);
        } else {
            JWT_DEV && logger(`event handler ${handler_name} is existing`);
        }
    }

    protected off_listener(topic: string, name: string) {
        const handler_name = `${topic}/${name}`;
        const listener = this.#event_callback_cache.get(handler_name);
        if (listener) {
            this.#event_bus.removeEventListener(topic, listener);
            this.#event_callback_cache.delete(handler_name);
        } else {
            JWT_DEV && logger(`event handler ${handler_name} is not existing`);
        }
    }

    protected has_listener(topic: string, name: string) {
        return this.#event_callback_cache.has(`${topic}/${name}`);
    }

    protected emit_event<T>(topic: string, detail?: T) {
        this.#event_bus.dispatchEvent(new CustomEvent(topic, { detail }));
    }

    topic<T = unknown>(topic: string): BlockScopedEventBus<T> {
        return (
            this.#scoped_cache.get(topic) ||
            new BlockScopedEventBus<T>(topic, this.#event_bus)
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
    readonly #topic: string;

    constructor(topic: string, event_bus?: EventTarget) {
        super(event_bus);
        this.#topic = topic;
    }

    on(
        name: string,
        listener: ((e: T) => Promise<void>) | ((e: T) => void),
        options?: ListenerOptions
    ) {
        if (options?.debounce) {
            const { wait, maxWait } = options.debounce;
            const debounced = debounce(listener, wait, { maxWait });
            this.on_listener(this.#topic, name, e => {
                debounced((e as CustomEvent)?.detail);
            });
        } else {
            this.on_listener(this.#topic, name, e => {
                listener((e as CustomEvent)?.detail);
            });
        }
    }

    off(name: string) {
        this.off_listener(this.#topic, name);
    }

    has(name: string) {
        return this.has_listener(this.#topic, name);
    }

    emit(detail?: T) {
        this.emit_event(this.#topic, detail);
    }
}
