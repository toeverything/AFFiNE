import { StrictMode } from 'react';

import { BasePlugin } from '../../base-plugin';
import { PluginRenderRoot } from '../../utils';
import { CommandMenu } from './Menu';

const PLUGIN_NAME = 'command-menu';

export class CommandMenuPlugin extends BasePlugin {
    private root?: PluginRenderRoot;

    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override _onRender(): void {
        const container = document.createElement('div');
        // TODO remove
        container.classList.add(`id-${PLUGIN_NAME}`);
        this.root = new PluginRenderRoot({
            name: PLUGIN_NAME,
            render: this.editor.reactRenderRoot.render,
        });
        this.root.mount();
        this.renderCommandMenu();
    }

    private renderCommandMenu(): void {
        //TODO If you change to PluginRenderRoot here, you need to support PluginRenderRoot under body
        this.root?.render(
            <StrictMode>
                <CommandMenu editor={this.editor} hooks={this.hooks} />
            </StrictMode>
        );
    }
}
