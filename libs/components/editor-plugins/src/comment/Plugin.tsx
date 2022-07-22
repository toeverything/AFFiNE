import { StrictMode } from 'react';
import { BasePlugin } from '../base-plugin';
import { PluginRenderRoot } from '../utils';
import { AddCommentPluginContainer } from './Container';

const PLUGIN_NAME = 'add-comment-plugin';

export class AddCommentPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private root: PluginRenderRoot;

    protected override on_render(): void {
        this.root = new PluginRenderRoot({
            name: AddCommentPlugin.pluginName,
            render: this.editor.reactRenderRoot?.render,
        });

        this.root.mount();
        this.renderAddComment();
    }

    private renderAddComment(): void {
        this.root?.render(
            <StrictMode>
                <AddCommentPluginContainer
                    editor={this.editor}
                    hooks={this.hooks}
                />
            </StrictMode>
        );
    }

    public override dispose() {
        this.root?.unmount();
        super.dispose();
    }
}
