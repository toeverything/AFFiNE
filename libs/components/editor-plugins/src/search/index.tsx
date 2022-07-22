import { StrictMode } from 'react';

import { HookType } from '@toeverything/framework/virgo';

import { BasePlugin } from '../base-plugin';
import { Search } from './search';
import { PluginRenderRoot } from '../utils';

export class FullTextSearchPlugin extends BasePlugin {
    #root?: PluginRenderRoot;

    public static override get pluginName(): string {
        return 'search';
    }

    public override init(): void {
        this.hooks.addHook(HookType.ON_SEARCH, this.handle_search, this);
    }

    private unmount() {
        if (this.#root) {
            this.editor.setHotKeysScope();
            this.#root.unmount();
            this.#root = undefined;
        }
    }

    private handle_search() {
        this.editor.setHotKeysScope('search');
        this.render_search();
    }
    private render_search() {
        this.#root = new PluginRenderRoot({
            name: FullTextSearchPlugin.pluginName,
            render: this.editor.reactRenderRoot.render,
        });
        this.#root.mount();
        this.#root.render(
            <StrictMode>
                <Search onClose={() => this.unmount()} editor={this.editor} />
            </StrictMode>
        );
    }
    public renderSearch() {
        this.render_search();
    }
}

export type { QueryResult } from './search';
export { QueryBlocks } from './search';
