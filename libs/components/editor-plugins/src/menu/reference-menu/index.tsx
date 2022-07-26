import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BasePlugin } from '../../base-plugin';
import { ReferenceMenu } from './ReferenceMenu';

const PLUGIN_NAME = 'reference-menu';

export class ReferenceMenuPlugin extends BasePlugin {
    private root?: Root;

    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override _onRender(): void {
        const container = document.createElement('div');
        // TODO: remove
        container.classList.add(`id-${PLUGIN_NAME}`);
        // this.editor.attachElement(this.menu_container);
        window.document.body.appendChild(container);
        this.root = createRoot(container);
        this.render_reference_menu();
    }

    private render_reference_menu(): void {
        this.root?.render(
            <StrictMode>
                <ReferenceMenu editor={this.editor} hooks={this.hooks} />
            </StrictMode>
        );
    }
}
