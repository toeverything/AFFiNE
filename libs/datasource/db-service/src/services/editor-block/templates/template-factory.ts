import { Template, TemplateMeta, GroupTemplate } from './types';
import blogTemplate from './blog.json';
import emptyTemplate from './empty.json';
import gridTemplate from './grid.json';
import todoTemplate from './todo.json';
import getStartedGroup0 from './get-started-group0.json';
import getStartedGroup1 from './get-started-group1.json';

export type GroupTemplateKeys =
    | 'todolist'
    | 'blog'
    | 'empty'
    | 'grid'
    | 'getStartedGroup0'
    | 'getStartedGroup1';
type GroupTemplateMap = Record<GroupTemplateKeys, any>;
const groupTemplateMap = {
    empty: emptyTemplate,
    todolist: todoTemplate,
    blog: blogTemplate,
    grid: gridTemplate,
    getStartedGroup0,
    getStartedGroup1,
} as GroupTemplateMap;

const defaultTemplateList: Array<TemplateMeta> = [
    {
        name: 'New From Quick Start',
        groupKeys: ['todolist'],
    },
    { name: 'New From Grid System', groupKeys: ['grid'] },
    { name: 'New From Blog', groupKeys: ['blog'] },
    { name: ' New Todolist', groupKeys: ['todolist'] },
    { name: ' New Empty Page', groupKeys: ['empty'] },
];

const TemplateFactory = {
    defaultTemplateList,
    generatePageTemplateByGroupKeys(props: TemplateMeta): Template {
        const newTitle = props.name || 'Get Started with AFFiNE';
        const keys: GroupTemplateKeys[] = props.groupKeys || [];
        const blankPage: Template = {
            type: 'page',
            properties: {
                text: { value: [{ text: newTitle }] },
                fullWidthChecked: false,
            },
            blocks: [],
        };
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key in groupTemplateMap) {
                blankPage.blocks = blankPage.blocks || [];
                if (groupTemplateMap[key]) {
                    blankPage.blocks.push(groupTemplateMap[key]);
                }
            }
        }

        return blankPage;
    },
};

export { TemplateFactory };
