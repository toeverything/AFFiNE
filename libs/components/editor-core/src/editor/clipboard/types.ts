import {
    BlockFlavorKeys,
    DefaultColumnsValue,
} from '@toeverything/datasource/db-service';
import { SelectInfo } from '../selection';

export const OFFICE_CLIPBOARD_MIMETYPE = {
    DOCS_DOCUMENT_SLICE_CLIP_WRAPPED: 'affine/x-c+w',
    HTML: 'text/html',
    TEXT: 'text/plain',
    IMAGE_BMP: 'image/bmp',
    IMAGE_GIF: 'image/gif',
    IMAGE_JPEG: 'image/jpeg',
    IMAGE_JPG: 'image/jpg',
    IMAGE_PNG: 'image/png',
    IMAGE_SVG: 'image/svg',
    IMAGE_WEBP: 'image/webp',
};

export interface ClipBlockInfo {
    type: BlockFlavorKeys;
    properties?: Partial<DefaultColumnsValue>;
    children: ClipBlockInfo[];
}

export interface InnerClipInfo {
    select: SelectInfo;
    data: ClipBlockInfo[];
}
