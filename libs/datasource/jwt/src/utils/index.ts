import { Buffer } from 'buffer';
import debug from 'debug';
import { enableAllPlugins } from 'immer';
import { SHAKE } from 'sha3';
import { v5 as UUIDv5 } from 'uuid';
import { AbstractBlock } from '../block/abstract';

import { UUID } from '../types';

declare const JWT_DEV: boolean;

enableAllPlugins();

const hash = new SHAKE(128);

// sha3-256(toeverythinguuid) -> truncate 128 bits
// e66a34f77a3b09d2020eb20e1f77e3c56250c19788ed2c70993ad2c495e55de6
const UUID_NAMESPACE = Uint8Array.from([
    0xe6, 0x6a, 0x34, 0xf7, 0x7a, 0x3b, 0x09, 0xd2, 0x02, 0x0e, 0xb2, 0x0e,
    0x1f, 0x77, 0xe3, 0xc5,
]);

// eslint-disable-next-line @typescript-eslint/naming-convention
export function genUUID(workspace: string): UUID<string> {
    return UUIDv5(workspace, UUID_NAMESPACE) as UUID<string>;
}

export function sha3(buffer: Buffer): string {
    hash.reset();
    hash.update(buffer);
    return hash
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

export function getLogger(namespace: string) {
    if (JWT_DEV) {
        const logger = debug(namespace);
        logger.log = console.log.bind(console);
        if (JWT_DEV === ('testing' as any)) logger.enabled = true;
        return logger;
    } else {
        return () => {};
    }
}

export function isBlock(obj: any) {
    return obj && obj instanceof AbstractBlock;
}

export function sleep() {
    return new Promise(resolve => setTimeout(resolve, 500));
}

export { BlockEventBus } from './event-bus';
