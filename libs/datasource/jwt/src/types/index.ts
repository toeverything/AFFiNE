/* eslint-disable @typescript-eslint/naming-convention */
export { BlockTypes, BlockFlavors } from './block';
export type { BlockTypeKeys, BlockFlavorKeys, BlockItem } from './block';
export type { UUID } from './uuid';
export type { ExcludeFunction } from './utils';

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
    const isOnline = host.endsWith('affine.pro');
    const site = isOnline ? host : 'localhost:4200';
    return `${ws}://${site}/collaboration/`;
}

export const BucketBackend = {
    IndexedDB: 'idb',
    WebSQL: 'websql',
    YjsWebSocketAffine: getCollaborationPoint(),
};
