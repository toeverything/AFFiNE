import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BasePlugin } from '../base-plugin';
import { BlockDomInfo, HookType } from '@toeverything/framework/virgo';

import View from './view';
const PLUGIN_NAME = 'block-property';

export class BlockPropertyPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private root: Root | undefined;
    private root_dom: HTMLElement;
    // record mouse moving block id
    private current_sliding_block_info: BlockDomInfo;
    private is_render = false;
    private is_hover = false;

    private set_is_hover = (isHover: boolean) => {
        this.is_hover = isHover;
    };
    private insert_root_to_block = async () => {
        this.root_dom = document.createElement('div');
        this.root_dom.style.position = 'relative';
        this.root_dom.style.zIndex = '1000';
        this.root_dom.classList.add(`id-${PLUGIN_NAME}`);
        this.current_sliding_block_info.dom.appendChild(this.root_dom);
        this.root = createRoot(this.root_dom);
    };

    private on_sliding_block_change = async (blockDomInfo: BlockDomInfo) => {
        this.current_sliding_block_info = blockDomInfo;
        await this.insert_root_to_block();
        this.render_view();
        this.is_render = true;
    };

    private on_mouse_move = async (
        event: React.MouseEvent,
        blockDomInfo: BlockDomInfo
    ) => {
        if (
            blockDomInfo.blockId !== this.current_sliding_block_info?.blockId &&
            !this.is_hover
        ) {
            await this.dispose();

            await this.on_sliding_block_change(blockDomInfo);
        }
    };

    private render_view = () => {
        this.root.render(
            <View
                blockDomInfo={this.current_sliding_block_info}
                setIsHover={this.set_is_hover}
            />
        );
    };

    protected override on_render(): void {
        this.hooks.addHook(
            HookType.AFTER_ON_NODE_MOUSE_MOVE,
            this.on_mouse_move,
            this
        );
    }

    override async dispose() {
        if (this.current_sliding_block_info) {
            this.current_sliding_block_info.dom.removeChild(this.root_dom);
            this.current_sliding_block_info = undefined;
        }

        this.root_dom = undefined;
        this.is_render = false;
        if (this.root) {
            this.root.unmount();
        }
    }
}
