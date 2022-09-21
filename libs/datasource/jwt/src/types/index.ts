/* eslint-disable @typescript-eslint/naming-convention */
export { BlockFlavors, BlockTypes } from './block';
export type { BlockFlavorKeys, BlockItem, BlockTypeKeys } from './block';
export type { ExcludeFunction } from './utils';
export type { UUID } from './uuid';

function getLocation() {
    try {
        const { protocol, host } = window.location;
        return { protocol, host };
    } catch (e) {
        return { protocol: 'http:', host: 'localhost' };
    }
}

function getCollaborationPoint() {
    const { protocol, host } = getLocation();
    const ws = protocol.startsWith('https') ? 'wss' : 'ws';
    return `${ws}://${host}/collaboration/`;
}

export const BucketBackend = {
    IndexedDB: 'idb',
    WebSQL: 'websql',
    YjsWebSocketAffine: getCollaborationPoint(),
};
