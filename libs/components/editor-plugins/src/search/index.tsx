import { StrictMode } from 'react';
import { BasePlugin } from '../base-plugin';
import { PluginRenderRoot } from '../utils';
import { Search } from './Search';

export class FullTextSearchPlugin extends BasePlugin {
    private root?: PluginRenderRoot;

    public static override get pluginName(): string {
        return 'search';
    }

    protected override _onRender(): void {
        this.root = new PluginRenderRoot({
            name: FullTextSearchPlugin.pluginName,
            render: this.editor.reactRenderRoot.render,
        });
        this._renderSearch();
    }

    private _renderSearch() {
        if (this.root) {
            this.root.mount();
            this.root.render(
                <StrictMode>
                    <Search editor={this.editor} hooks={this.hooks} />
                </StrictMode>
            );
        }
    }
    public renderSearch() {
        this._renderSearch();
    }

    public override dispose() {
        this.root?.unmount();
        super.dispose();
    }
}

export { QueryBlocks } from './Search';
export type { QueryResult } from './Search';
