import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { DoubleLinkMenu } from './DoubleLinkMenu';

const PLUGIN_NAME = 'reference-menu';

export class DoubleLinkMenuPlugin extends BasePlugin {
    private _root?: PluginRenderRoot;

    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override _onRender(): void {
        this._root = new PluginRenderRoot({
            name: PLUGIN_NAME,
            render: this.editor.reactRenderRoot.render,
        });
        this._root.mount();

        this._root?.render(
            <StrictMode>
                <DoubleLinkMenu editor={this.editor} hooks={this.hooks} />
            </StrictMode>
        );
    }

    public override dispose() {
        this._root?.unmount();
        super.dispose();
    }
}
