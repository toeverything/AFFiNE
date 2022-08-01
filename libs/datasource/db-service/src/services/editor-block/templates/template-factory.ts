import { groupTemplateMap } from './group-templates';
import { Template, TemplateMeta } from './types';
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
    defaultTemplateList: defaultTemplateList,
    generatePageTemplateByGroupKeys(props: TemplateMeta): Template {
        const newTitle = props.name || 'Get Started with AFFiNE';
        const keys = props.groupKeys || [];
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
