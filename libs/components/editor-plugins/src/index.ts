import type { PluginCreator } from '@toeverything/framework/virgo';
import { AddCommentPlugin } from './comment';
import {
    CommandMenuPlugin,
    DoubleLinkMenuPlugin,
    GroupMenuPlugin,
    InlineMenuPlugin,
    LeftMenuPlugin,
    SelectionGroupPlugin,
} from './menu';
import { FullTextSearchPlugin } from './search';
import { TemplatePlugin } from './template';
// import { PlaceholderPlugin } from './placeholder';

// import { BlockPropertyPlugin } from './block-property';

export const plugins: PluginCreator[] = [
    FullTextSearchPlugin,
    LeftMenuPlugin,
    InlineMenuPlugin,
    CommandMenuPlugin,
    DoubleLinkMenuPlugin,
    TemplatePlugin,
    SelectionGroupPlugin,
    AddCommentPlugin,
    GroupMenuPlugin,
];
