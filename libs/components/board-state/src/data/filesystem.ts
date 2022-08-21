/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { TDDocument, TDFile } from '@toeverything/components/board-types';
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
} from '@toeverything/components/board-types';
import { get as getFromIdb, set as setToIdb } from 'idb-keyval';
import type { FileSystemHandle } from './browser-fs-access';

const options = { mode: 'readwrite' as const };

const checkPermissions = async (handle: FileSystemHandle) => {
    return (
        (await handle.queryPermission(options)) === 'granted' ||
        (await handle.requestPermission(options)) === 'granted'
    );
};

export async function loadFileHandle() {
    if (typeof Window === 'undefined' || !('_location' in Window)) return;
    const fileHandle = await getFromIdb(
        `Tldraw_file_handle_${window.location.origin}`
    );
    if (!fileHandle) return null;
    return fileHandle;
}

export async function saveFileHandle(fileHandle: FileSystemHandle | null) {
    return setToIdb(`Tldraw_file_handle_${window.location.origin}`, fileHandle);
}

export async function saveToFileSystem(
    document: TDDocument,
    fileHandle: FileSystemHandle | null
) {
    // Create the saved file data
    const file: TDFile = {
        name: document.name || 'New Document',
        fileHandle: fileHandle ?? null,
        document,
        assets: {},
    };

    // Serialize to JSON
    const json = JSON.stringify(file, null, 2);

    // Create blob
    const blob = new Blob([json], {
        type: 'application/vnd.Tldraw+json',
    });

    if (fileHandle) {
        const hasPermissions = await checkPermissions(fileHandle);
        if (!hasPermissions) return null;
    }

    // Save to file system
    // @ts-ignore
    const browser_fs = await import('./browser-fs-access');
    const fileSave = browser_fs.fileSave;
    const newFileHandle = await fileSave(
        blob,
        {
            fileName: `${file.name}.tldr`,
            description: 'Tldraw File',
            extensions: [`.tldr`],
        },
        fileHandle
    );

    await saveFileHandle(newFileHandle);

    // Return true
    return newFileHandle;
}

export async function openFromFileSystem(): Promise<null | {
    fileHandle: FileSystemHandle | null;
    document: TDDocument;
}> {
    // Get the blob
    // @ts-ignore
    const browser_fs = await import('./browser-fs-access');
    const fileOpen = browser_fs.fileOpen;
    const blob = await fileOpen({
        description: 'Tldraw File',
        extensions: [`.tldr`],
        multiple: false,
    });

    if (!blob) return null;

    // Get JSON from blob
    const json: string = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.readyState === FileReader.DONE) {
                resolve(reader.result as string);
            }
        };
        reader.readAsText(blob, 'utf8');
    });

    // Parse
    const file: TDFile = JSON.parse(json);

    const fileHandle = blob.handle ?? null;

    await saveFileHandle(fileHandle);

    return {
        fileHandle,
        document: file.document,
    };
}

export async function openAssetFromFileSystem() {
    // @ts-ignore
    const browser_fs = await import('./browser-fs-access');
    const fileOpen = browser_fs.fileOpen;
    return fileOpen({
        description: 'Image or Video',
        extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS],
        multiple: false,
    });
}

export function fileToBase64(file: Blob): Promise<string | ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
        if (file) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.onabort = error => reject(error);
        }
    });
}

export function fileToText(file: Blob): Promise<string | ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
        if (file) {
            const reader = new FileReader();
            reader.readAsText(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.onabort = error => reject(error);
        }
    });
}

export function getImageSizeFromSrc(src: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([img.width, img.height]);
        img.onerror = () => reject(new Error('Could not get image size'));
        img.src = src;
    });
}

export function getVideoSizeFromSrc(src: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.onloadedmetadata = () =>
            resolve([video.videoWidth, video.videoHeight]);
        video.onerror = () => reject(new Error('Could not get video size'));
        video.src = src;
    });
}
