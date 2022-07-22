import { diContainer, serviceMapByCallName } from './services';
import type { DbServicesMap } from './services';
export type { Template } from './services/editor-block/templates/types';
export {
    TemplateFactory,
    type TemplateMeta,
} from './services/editor-block/templates';

export type { ReturnUnobserve } from './services/database';
export type { Comment, CommentReply } from './services/comment/types';

const api = new Proxy<DbServicesMap>({} as DbServicesMap, {
    get(target, prop) {
        const token = serviceMapByCallName[prop as string]?.token;
        if (!token) {
            return undefined;
        }
        return diContainer.getDependency(token);
    },
});

export const services = {
    api,
};
(window as any)['services'] = services;

export type {
    CreateEditorBlock,
    ReturnEditorBlock,
    GetEditorBlock,
    UpdateEditorBlock,
    DeleteEditorBlock,
    BlockFlavors,
    BlockFlavorKeys,
    Column,
    ContentColumn,
    NumberColumn,
    EnumColumn,
    DateColumn,
    BooleanColumn,
    FileColumn,
    DefaultColumnsValue,
    ContentColumnValue,
    NumberColumnValue,
    EnumColumnValue,
    BooleanColumnValue,
    DateColumnValue,
    FileColumnValue,
    StringColumnValue,
} from './services';
export {
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isFileColumn,
    isNumberColumn,
    isEnumColumn,
    isStringColumn,
} from './services';
export { Protocol } from './protocol';
export { DEFAULT_COLUMN_KEYS } from './services/editor-block/utils/column/default-config';
