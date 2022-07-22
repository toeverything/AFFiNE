import { KeyboardEvent } from 'react';

class KeyboardHelper {
    public eventHelper: EventHelper;

    constructor() {
        this.eventHelper = new EventHelper();
    }
}

class EventHelper {
    isSelectAll(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.code === 'KeyA') {
            return true;
        }
        return false;
    }
}

export const keyboardHelper = new KeyboardHelper();
