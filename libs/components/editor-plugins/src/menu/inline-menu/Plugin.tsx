import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { InlineMenuContainer } from './Container';

const PLUGIN_NAME = 'inline-menu';

export class InlineMenuPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private _root: PluginRenderRoot;

    protected override _onRender(): void {
        this._root = new PluginRenderRoot({
            name: InlineMenuPlugin.pluginName,
            render: this.editor.reactRenderRoot?.render,
        });

        this._root.mount();
        this._renderInlineMenu();
    }

    private _renderInlineMenu(): void {
        this._root?.render(
            <StrictMode>
                <InlineMenuContainer editor={this.editor} />
            </StrictMode>
        );
    }

    public override dispose() {
        this._root?.unmount();
        super.dispose();
    }
}
