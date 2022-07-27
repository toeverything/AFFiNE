import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BasePlugin } from '../base-plugin';
import { BlockDomInfo, HookType } from '@toeverything/framework/virgo';

import View from './View';
import { Subscription } from 'rxjs';
const PLUGIN_NAME = 'block-property';

export class BlockPropertyPlugin extends BasePlugin {
    public static override get pluginName(): string {
        return PLUGIN_NAME;
    }

    private _root: Root | undefined;
    private _rootDom: HTMLElement;
    // record mouse moving block id
    private _currentSlidingBlockInfo: BlockDomInfo;
    private _hover = false;

    private _setHover = (isHover: boolean) => {
        this._hover = isHover;
    };
    private _insertRootToBlock = async () => {
        this._rootDom = document.createElement('div');
        this._rootDom.style.position = 'relative';
        this._rootDom.style.zIndex = '1000';
        this._rootDom.classList.add(`id-${PLUGIN_NAME}`);
        this._currentSlidingBlockInfo.dom.appendChild(this._rootDom);
        this._root = createRoot(this._rootDom);
    };

    private _onSlidingBlockChange = async (blockDomInfo: BlockDomInfo) => {
        this._currentSlidingBlockInfo = blockDomInfo;
        await this._insertRootToBlock();
        this._renderView();
    };

    private _onMouseMove = async ([event, blockDomInfo]: [
        React.MouseEvent,
        BlockDomInfo
    ]) => {
        if (
            blockDomInfo.blockId !== this._currentSlidingBlockInfo?.blockId &&
            !this._hover
        ) {
            await this.dispose();

            await this._onSlidingBlockChange(blockDomInfo);
        }
    };

    private _renderView = () => {
        this._root.render(
            <View
                blockDomInfo={this._currentSlidingBlockInfo}
                setIsHover={this._setHover}
            />
        );
    };

    protected override _onRender(): void {
        const sub = this.hooks
            .get(HookType.AFTER_ON_NODE_MOUSE_MOVE)
            .subscribe(this._onMouseMove);

        this.sub.add(sub);
    }

    override async dispose() {
        if (this._currentSlidingBlockInfo) {
            this._currentSlidingBlockInfo.dom.removeChild(this._rootDom);
            this._currentSlidingBlockInfo = undefined;
        }

        this._rootDom = undefined;
        if (this._root) {
            this._root.unmount();
        }
        super.dispose();
    }
}
