import { BlockFlavorKeys, DefaultColumnsValue } from './../index';
import { GroupTemplateKeys } from './template-factory';

// interface Block {
//     type: BlockFlavorKeys;
//     properties: Partial<DefaultColumnsValue>;
// }
export type TemplateProperties = Partial<DefaultColumnsValue>;
export interface Template {
    type: BlockFlavorKeys;
    properties: TemplateProperties;
    blocks?: Template[];
}

export interface GroupTemplate {
    type: BlockFlavorKeys;
    properties: TemplateProperties;
    blocks?: Template[];
}
export interface TemplateMeta {
    name: string | null;
    groupKeys: Array<GroupTemplateKeys> | [];
}

// export { Template, TemplateProperties };
