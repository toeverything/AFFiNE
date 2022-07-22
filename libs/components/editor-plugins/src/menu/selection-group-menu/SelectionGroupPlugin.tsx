import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { MenuApp, StoreContext } from './MenuApp';

const PLUGIN_NAME = 'selection-group';

export class SelectionGroupPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private root: PluginRenderRoot | undefined;

    protected override on_render() {
        this.root = new PluginRenderRoot({
            name: SelectionGroupPlugin.pluginName,
            render: this.editor.reactRenderRoot?.render,
        });
        this.root.mount();
        this.root.render(
            <StrictMode>
                <StoreContext.Provider
                    value={{ editor: this.editor, hooks: this.hooks }}
                >
                    <MenuApp />
                </StoreContext.Provider>
            </StrictMode>
        );
    }

    public override dispose() {
        this.root?.unmount();
        super.dispose();
    }
}
