import type { PluginCreator } from '@toeverything/framework/virgo';
import {
    LeftMenuPlugin,
    InlineMenuPlugin,
    CommandMenuPlugin,
    ReferenceMenuPlugin,
    SelectionGroupPlugin,
    GroupMenuPlugin,
} from './menu';
import { TemplatePlugin } from './template';
import { FullTextSearchPlugin } from './search';
import { AddCommentPlugin } from './comment';
// import { PlaceholderPlugin } from './placeholder';

// import { BlockPropertyPlugin } from './block-property';

export const plugins: PluginCreator[] = [
    FullTextSearchPlugin,
    LeftMenuPlugin,
    InlineMenuPlugin,
    CommandMenuPlugin,
    ReferenceMenuPlugin,
    TemplatePlugin,
    // SelectionGroupPlugin,
    AddCommentPlugin,
    GroupMenuPlugin,
];
