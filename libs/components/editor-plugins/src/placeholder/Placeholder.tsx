import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BasePlugin } from './../base-plugin';
import { PlaceholderPanel } from './PlaceholderPanel';
const PLUGIN_NAME = 'placeholder';

export class PlaceholderPlugin extends BasePlugin {
    private root?: Root;

    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    protected override _onRender(): void {
        const container = document.createElement('div');
        // TODO remove
        container.classList.add(`id-${PLUGIN_NAME}`);
        window.document.body.appendChild(container);
        this.root = createRoot(container);
        this._renderPlugin();
    }

    private _renderPlugin(): void {
        this.root?.render(
            <StrictMode>
                <PlaceholderPanel
                    editor={this.editor}
                    onClickTips={() => this.dispose()}
                />
            </StrictMode>
        );
    }

    public override dispose(): void {
        this.root?.unmount();
    }
}
