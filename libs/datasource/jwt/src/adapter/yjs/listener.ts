import { produce } from 'immer';
import { debounce } from 'ts-debounce';
import { YEvent } from 'yjs';
import { BlockListener, ChangedStateKeys } from '../index';

let listener_suspend = false;

let listener_map = new Map<BlockListener, [string, ChangedStateKeys][]>();

const debounced_suspend_notifier = debounce(
    (listener?: BlockListener) => {
        if (listener) {
            listener_map = produce(listener_map, draft => {
                const events = draft.get(listener);
                if (events) {
                    listener(new Map(events));
                    draft.delete(listener);
                }
            });
        }
    },
    500,
    { maxWait: 2000 }
);

/**
 * Suspend instant update event dispatch, extend to at least 500ms once, and up to 2000ms once when triggered continuously
 * @param suspend true: suspend monitoring, false: resume monitoring
 */
export function Suspend(suspend: boolean) {
    listener_suspend = produce(listener_suspend, draft => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        draft = suspend;
    });
    if (!suspend && listener_map.size) {
        listener_map = produce(listener_map, draft => {
            for (const [listener, events] of draft) {
                listener(new Map(events));
            }
            draft.clear();
        });
    }
}

export function EmitEvents(
    events: [string, ChangedStateKeys][],
    listener?: BlockListener
) {
    if (listener) {
        if (listener_suspend) {
            listener_map = produce(listener_map, draft => {
                const old_events = listener_map.get(listener) || [];
                draft.set(listener, [...old_events, ...events]);
            });
            debounced_suspend_notifier(listener);
        } else {
            listener(new Map(events));
        }
    }
}

export function ChildrenListenerHandler(
    listeners: Map<string, BlockListener>,
    event: YEvent<any>
) {
    if (listeners.size) {
        const keys = Array.from(event.keys.entries()).map(
            ([key, { action }]) => [key, action] as [string, ChangedStateKeys]
        );
        const deleted = Array.from(event.changes.deleted.values())
            .flatMap(val => val.content.getContent() as string[])
            .filter(v => v)
            .map(k => [k, 'delete'] as [string, ChangedStateKeys]);
        for (const listener of listeners.values()) {
            EmitEvents([...keys, ...deleted], listener);
        }
    }
}

export function ContentListenerHandler(
    listeners: Map<string, BlockListener>,
    events: YEvent<any>[]
) {
    if (listeners.size) {
        const keys = events.flatMap(e => {
            if ((e.path?.length | 0) > 0) {
                return [[e.path[0], 'update'] as [string, 'update']];
            } else {
                return Array.from(e.changes.keys.entries()).map(
                    ([k, { action }]) => [k, action] as [string, typeof action]
                );
            }
        });
        if (keys.length) {
            for (const listener of listeners.values()) {
                EmitEvents(keys, listener);
            }
        }
    }
}
