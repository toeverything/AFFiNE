import { useState, useEffect, useRef } from 'react';

type Equal<X, Y, TrueValue, FalseValue> =
    // prettier-ignore
    (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? TrueValue
    : FalseValue;

type ExtractEvent<K extends keyof DocumentEventMap, E> = Equal<
    DocumentEventMap[K],
    E,
    K,
    never
>;

type MouseEventName = {
    [K in keyof DocumentEventMap]: ExtractEvent<K, MouseEvent>;
}[keyof DocumentEventMap];

type TouchEventName = {
    [K in keyof DocumentEventMap]: ExtractEvent<K, TouchEvent>;
}[keyof DocumentEventMap];

type PointerEventName = {
    [K in keyof DocumentEventMap]: ExtractEvent<K, PointerEvent>;
}[keyof DocumentEventMap];

interface EventAwayProps {
    eventName: MouseEventName | TouchEventName | PointerEventName;
    anchor: HTMLElement | HTMLElement[];
}

export const useEventAway = ({ eventName, anchor }: EventAwayProps) => {
    const [away, set_away] = useState(true);
    const anchors = useRef<HTMLElement[]>([]);
    anchors.current = Array.isArray(anchor) ? anchor : [anchor];

    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent | PointerEvent) => {
            if (event.composedPath) {
                const composed_path = event.composedPath();
                const found = composed_path.find(node =>
                    anchors.current.includes(node as HTMLElement)
                );
                set_away(!found);
            } else {
                const found = anchors.current.find(anchor =>
                    anchor.contains(event.target as HTMLElement)
                );
                set_away(!found);
            }
        };

        document.addEventListener(eventName, listener);

        return () => {
            document.removeEventListener(eventName, listener);
        };
    }, [eventName]);

    return { away };
};
