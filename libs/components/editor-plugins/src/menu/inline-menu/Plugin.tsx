import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { InlineMenuContainer } from './Container';

const PLUGIN_NAME = 'inline-menu';

export class InlineMenuPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private root: PluginRenderRoot;

    protected override _onRender(): void {
        this.root = new PluginRenderRoot({
            name: InlineMenuPlugin.pluginName,
            render: this.editor.reactRenderRoot?.render,
        });

        this.root.mount();
        this._renderInlineMenu();
    }

    private _renderInlineMenu(): void {
        this.root?.render(
            <StrictMode>
                <InlineMenuContainer editor={this.editor} hooks={this.hooks} />
            </StrictMode>
        );
    }

    public override dispose() {
        this.root?.unmount();
        super.dispose();
    }
}
