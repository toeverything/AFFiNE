/* eslint-disable filename-rules/match */
import { StrictMode } from 'react';

import { HookType } from '@toeverything/framework/virgo';

import { BasePlugin } from '../base-plugin';
import { Search } from './Search';
import { PluginRenderRoot } from '../utils';

export class FullTextSearchPlugin extends BasePlugin {
    #root?: PluginRenderRoot;

    public static override get pluginName(): string {
        return 'search';
    }

    public override init(): void {
        this.sub.add(
            this.hooks.get(HookType.ON_SEARCH).subscribe(this._handleSearch)
        );
    }

    protected override _onRender(): void {
        this.#root = new PluginRenderRoot({
            name: FullTextSearchPlugin.pluginName,
            render: this.editor.reactRenderRoot.render,
        });
    }

    private unmount() {
        if (this.#root) {
            this.editor.setHotKeysScope();
            this.#root.unmount();
            // this.#root = undefined;
        }
        this.sub.unsubscribe();
    }

    private _handleSearch = () => {
        this.editor.setHotKeysScope('search');
        this.render_search();
    };
    private render_search() {
        if (this.#root) {
            this.#root.mount();
            this.#root.render(
                <StrictMode>
                    <Search
                        onClose={() => this.unmount()}
                        editor={this.editor}
                    />
                </StrictMode>
            );
        }
    }
    public renderSearch() {
        this.render_search();
    }
}

export type { QueryResult } from './Search';
export { QueryBlocks } from './Search';
