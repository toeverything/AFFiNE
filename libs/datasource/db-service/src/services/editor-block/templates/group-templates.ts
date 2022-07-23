//@ts-nocheck
import { GroupTemplate } from './types';
type GroupTemplateMap = Record<GroupTemplateKeys, GroupTemplate>;
const groupTemplateMap: GroupTemplateMap = {
    empty: {
        type: 'group',
        properties: {},
        blocks: [
            {
                type: 'text',
                properties: {
                    text: {
                        value: [{ text: '' }],
                    },
                },
                blocks: [],
            },
        ],
    },
    todolist: {
        type: 'group',
        properties: {},
        blocks: [
            {
                type: 'heading1',
                properties: {
                    text: {
                        value: [{ text: '🎓Graduating from the project' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Congratulations! Now you can start create your own projects!',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'To start using workspaces and folders hit the ',
                            },
                            {
                                bold: true,
                                text: 'button at the top left of the screen',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            {
                                text: '',
                            },
                            {
                                text: 'At any time if you feel lost do visit our 📚Blog: ',
                            },
                            {
                                type: 'link',
                                url: 'https://blog.affine.pro/',
                                id: 'link.qx4yhw81or54',
                                children: [
                                    {
                                        text: 'https://blog.affine.pro',
                                    },
                                ],
                            },
                            {
                                text: '',
                            },
                        ],
                    },
                    collapsed: {
                        value: false,
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            {
                                text: '',
                            },
                            {
                                text: 'If you have any suggestions drop a post in our Reddit Channel：',
                            },
                            {
                                type: 'link',
                                url: 'https://www.reddit.com/r/Affine/',
                                id: 'link.zeafc4ogfvrb',
                                children: [
                                    {
                                        text: 'https://www.reddit.com/r/Affine/',
                                    },
                                ],
                            },
                            {
                                text: ' ',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [
                            {
                                text: '🎉 The Essentials. Check things off after you tried them!',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            { text: ' ✅ ' },
                            { bold: true, text: 'Check' },
                            {
                                text: ' the text box here to complete the task!',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            { text: '' },
                            { text: '' },
                            { text: ' 👋 ' },
                            { bold: true, text: 'Drag' },
                            {
                                text: ' the ⠟ button left of the checkbox to reorder tasks',
                            },
                            { text: '' },
                            { text: '' },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'todo',
                properties: {
                    text: {
                        value: [
                            { text: '' },
                            { text: '' },
                            { text: ' ➡️ ' },
                            { bold: true, text: 'Fold' },
                            { text: ' and ' },
                            { bold: true, text: 'Unfold' },
                            {
                                text: ' a task to simplify your list using the arrow on the right ⤵️',
                            },
                        ],
                    },
                    numberType: 'type1',
                    collapsed: { value: false },
                },
            },
        ],
    },
    blog: {
        type: 'group',
        properties: {},
        blocks: [
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'As a collaborative real-time editor, Affine aims to resolve problems in three situations:',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'bullet',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Multi-master replication: the synchronization of data between equipment and applications;',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'bullet',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Eventual consistency: the consistence of data regardless of network latency and outage;',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'bullet',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Conflict resolution: the resolution of conflict between simultaneous edits.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'To achieve these aims, a proper collaborative algorithm should be used. There are hundreds of collaborative algorithms being invented over the past three decades, but they usually fall into two categories: either operational transformation (OT) or conflict-free replicated data type (CRDT). We think CRDT is a better choice.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading1',
                properties: {
                    text: {
                        value: [{ bold: true, text: 'What does CRDT do' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'CRDT is capable of discovering and resolving conflicts while ensuring the effective distribution and merge of date. It may sound like magic, but think about historical study, it is very possible to discover the truth from scattered evidence.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'For CRDT, every piece of data is like a "historic fragment". We keep collecting the fragments from other clients and then restore the truth by excluding repeated data and correcting false information.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading1',
                properties: {
                    text: {
                        value: [{ bold: true, text: 'Why CRDT is better' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'In contrast to OT, CRDT possesses three big advantages:',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [{ bold: true, text: 'Flexibility' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'CRDT supports more data types. For example, Yjs supports Array, Map, and Treelike, and therefore applies to more business scenarios.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [{ bold: true, text: 'Performance' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'CRDT tolerates higher latency and can wait longer for solving conflicts, whereas the calculation of OT in the same condition may become too overwhelming for a server to sustain.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [{ bold: true, text: 'Extensibility' }],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Because CRDT supports more data types and editor elements, it is more extensible.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading1',
                properties: {
                    text: { value: [{ text: 'Conclusion' }] },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Collaborative algorithm is still a foreign concept for many developers. There are some introductions to it, but as to how it shall be used, there is still lack of clear explanation. I hope this article helps. If you also work for a startup company and want some suggestions, CRDT, especially Yjs, should be a better choice.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: { text: { value: [{ text: '' }] } },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            { text: '' },
                            {
                                type: 'link',
                                url: 'https://blog.affine.pro/',
                                id: 'link.stubssslo0rq',
                                children: [{ text: '← View all posts' }],
                            },
                            { text: '' },
                        ],
                    },
                },
                blocks: [],
            },
        ],
    },
    grid: {
        type: 'group',
        properties: {},
        blocks: [
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [
                            {
                                bold: true,
                                text: 'Performance',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'CRDT tolerates higher latency and can wait longer for solving conflicts, whereas the calculation of OT in the same condition may become too overwhelming for a server to sustain.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading2',
                properties: {
                    text: {
                        value: [
                            {
                                bold: true,
                                text: 'Extensibility',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Because CRDT supports more data types and editor elements, it is more extensible.',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'heading1',
                properties: {
                    text: {
                        value: [
                            {
                                text: 'Conclusion',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'grid',
                properties: {},
                blocks: [
                    {
                        type: 'gridItem',
                        properties: {
                            gridItemWidth: '50%',
                        },
                        blocks: [
                            {
                                type: 'text',
                                properties: {
                                    text: {
                                        value: [
                                            {
                                                text: 'Collaborative algorithm is still a foreign concept for many developers. There are some introductions to it, but as to how it shall be used, there is still lack of clear explanation. I hope this article helps. If you also work for a startup company and want some suggestions, CRDT, especially Yjs, should be a better choice.',
                                            },
                                        ],
                                    },
                                },
                                blocks: [],
                            },
                        ],
                    },
                    {
                        type: 'gridItem',
                        properties: {
                            gridItemWidth: '50%',
                        },
                        blocks: [
                            {
                                type: 'text',
                                properties: {
                                    text: {
                                        value: [
                                            {
                                                text: 'Collaborative algorithm is still a foreign concept for many developers. There are some introductions to it, but as to how it shall be used, there is still lack of clear explanation. I hope this article helps. If you also work for a startup company and want some suggestions, CRDT, especially Yjs, should be a better choice.',
                                            },
                                        ],
                                    },
                                },
                                blocks: [],
                            },
                        ],
                    },
                ],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: '',
                            },
                        ],
                    },
                },
                blocks: [],
            },
            {
                type: 'text',
                properties: {
                    text: {
                        value: [
                            {
                                text: '',
                            },
                            {
                                type: 'link',
                                url: 'https://blog.affine.pro/',
                                id: 'link.stubssslo0rq',
                                children: [
                                    {
                                        text: '← View all posts',
                                    },
                                ],
                            },
                            {
                                text: '',
                            },
                        ],
                    },
                },
            },
        ],
    },
};

export type GroupTemplateKeys = 'todolist' | 'blog' | 'empty' | 'grid';
export { groupTemplateMap };
