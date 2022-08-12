import { useEffect, useMemo, useRef, useState } from 'react';

function usePrevious<T>(value: T) {
    const ref = useRef<T>();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

export function useTabs<K extends string>(tabs: K[], defaultTab?: K | null) {
    const state = useState<K | null>();
    const [selectedTab, setSelectedTab] = state;

    const activeIndex = useMemo(() => {
        if (selectedTab) {
            return tabs.indexOf(selectedTab);
        }
        return -1;
    }, [selectedTab, tabs]);

    const previousActiveIndex = usePrevious(activeIndex);

    useEffect(() => {
        if (tabs.length === 0) {
            setSelectedTab(undefined);
            return;
        }

        if (
            selectedTab === null ||
            (selectedTab && tabs.includes(selectedTab))
        ) {
            return;
        }

        if (
            typeof previousActiveIndex === 'number' &&
            previousActiveIndex >= 0 &&
            (tabs[previousActiveIndex] || tabs[previousActiveIndex - 1])
        ) {
            setSelectedTab(
                tabs[previousActiveIndex] || tabs[previousActiveIndex - 1]
            );
            return;
        }

        if (defaultTab === null) {
            return;
        }

        setSelectedTab(
            defaultTab && tabs.includes(defaultTab) ? defaultTab : tabs[0]
        );
    }, [defaultTab, previousActiveIndex, selectedTab, setSelectedTab, tabs]);

    return state;
}
