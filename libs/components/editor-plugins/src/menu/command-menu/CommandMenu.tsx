import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BasePlugin } from '../../base-plugin';
import { CommandMenu } from './Menu';

const PLUGIN_NAME = 'command-menu';

export class CommandMenuPlugin extends BasePlugin {
    private root?: Root;

    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override on_render(): void {
        const container = document.createElement('div');
        // TODO remove
        container.classList.add(`id-${PLUGIN_NAME}`);
        // this.editor.attachElement(this.menu_container);
        window.document.body.appendChild(container);
        this.root = createRoot(container);
        this.render_command_menu();
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
