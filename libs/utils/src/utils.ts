import type { UserInfo } from './types';

export function getUserDisplayName(user?: UserInfo) {
    const { nickname, username, email } = user || {};
    return nickname || username || email || 'Unknown User';
}

/**
 * Get workspace_id from URL
 * @returns workspace_id
 */
export function getWorkspaceId() {
    const path = window.location.pathname.match(/\/(\w+)\//);
    return path ? path[1] : undefined;
}

/**
 * Get page_id from URL
 * @returns page_id
 */
export function getPageId() {
    const path = window.location.pathname.match(/\/(\w+)\/(\w+)/);
    return path ? path[2] : undefined;
}

export async function sleep(delay = 100) {
    return new Promise(res => {
        window.setTimeout(() => {
            res(true);
        }, delay);
    });
}

export function isInternalPageUrl(url: string) {
    if (!url) return false;
    return (
        url.startsWith(window.location.origin) &&
        /^https?:\/\/(localhost:4200|(nightly|app)\.affine\.pro|.*?\.ligo-virgo\.pages\.dev)/.test(
            url
        )
    );
}

export function getRelativeUrlForInternalPageUrl(url: string) {
    if (url?.startsWith(window.location.origin)) {
        return url.slice(window.location.origin.length);
    }

    return url;
}

/**
 * Generate a fragile object that will throw error at any operation.
 */
export const genErrorObj = (
    ...args: ConstructorParameters<ErrorConstructor>
): unknown =>
    new Proxy(
        {},
        {
            get(target, prop, receiver) {
                console.error('You are trying to access a property', prop);
                throw new Error(...args);
            },
            set(target, prop, val, receiver) {
                console.error('You are trying to set a property', prop, val);
                throw new Error(...args);
            },
            apply(target, thisArg, argumentsList) {
                console.error(
                    'You are trying to call a function',
                    thisArg,
                    argumentsList
                );
                throw new Error(...args);
            },
        }
    );
