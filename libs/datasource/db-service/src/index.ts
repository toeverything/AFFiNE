import type { DbServicesMap } from './services';
import { diContainer, serviceMapByCallName } from './services';
export { Protocol } from './protocol';
export {
    ColumnType,
    isBooleanColumn,
    isContentColumn,
    isDateColumn,
    isEnumColumn,
    isFileColumn,
    isNumberColumn,
    isStringColumn,
} from './services';
export type {
    BlockFlavorKeys,
    BlockFlavors,
    BooleanColumn,
    BooleanColumnValue,
    Column,
    ContentColumn,
    ContentColumnValue,
    CreateEditorBlock,
    DateColumn,
    DateColumnValue,
    DefaultColumnsValue,
    DeleteEditorBlock,
    EnumColumn,
    EnumColumnValue,
    FileColumn,
    FileColumnValue,
    GetEditorBlock,
    NumberColumn,
    NumberColumnValue,
    ReturnEditorBlock,
    StringColumnValue,
    UpdateEditorBlock,
} from './services';
export type { Comment, CommentReply } from './services/comment/types';
export type { ReturnUnobserve } from './services/database';
export {
    TemplateFactory,
    type TemplateMeta,
} from './services/editor-block/templates';
export type { Template } from './services/editor-block/templates/types';
export { containerFlavor } from './services/editor-block/types';
export { DEFAULT_COLUMN_KEYS } from './services/editor-block/utils/column/default-config';

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
