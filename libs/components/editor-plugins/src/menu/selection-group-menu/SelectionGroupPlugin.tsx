import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { MenuApp } from './MenuApp';

const PLUGIN_NAME = 'selection-group';

export class SelectionGroupPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private _root: PluginRenderRoot | undefined;

    protected override _onRender() {
        this._root = new PluginRenderRoot({
            name: SelectionGroupPlugin.pluginName,
            render: this.editor.reactRenderRoot?.render,
        });
        this._root.mount();
        this._root.render(
            <StrictMode>
                <MenuApp editor={this.editor} />
            </StrictMode>
        );
    }

    public override dispose() {
        this._root?.unmount();
        super.dispose();
    }
}
