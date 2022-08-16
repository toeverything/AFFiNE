import { StrictMode } from 'react';

import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { GroupMenu } from './GropuMenu';
// import { CommandMenu } from './Menu';

const PLUGIN_NAME = 'group-menu';

export class GroupMenuPlugin extends BasePlugin {
    private root?: PluginRenderRoot;
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override _onRender(): void {
        if (this.editor.isEdgeless) return;
        this.root = new PluginRenderRoot({
            name: PLUGIN_NAME,
            render: this.editor.reactRenderRoot.render,
        });
        this.root.mount();
        this._renderGroupMenu();
    }

    public override dispose() {
        this.root?.unmount();
        super.dispose();
    }

    private _renderGroupMenu(): void {
        this.root?.render(
            <StrictMode>
                <GroupMenu editor={this.editor} hooks={this.hooks} />
            </StrictMode>
        );
    }
}
