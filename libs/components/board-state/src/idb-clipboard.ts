import { get, set, del } from 'idb-keyval';

// Used for clipboard

const ID = 'tldraw_clipboard';

export async function getClipboard(): Promise<string | undefined> {
    return get(ID);
}

export async function setClipboard(item: string): Promise<void> {
    return set(ID, item);
}

export function clearClipboard(): Promise<void> {
    return del(ID);
}
