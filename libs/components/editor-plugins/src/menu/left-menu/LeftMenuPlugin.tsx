import { BlockDomInfo, HookType } from '@toeverything/framework/virgo';
import React, { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { ignoreBlockTypes } from './menu-config';
import { LineInfoSubject, LeftMenuDraggable } from './LeftMenuDraggable';
import { PluginRenderRoot } from '../../utils';
import { Subject } from 'rxjs';
import { domToRect, last, Point } from '@toeverything/utils';

export class LeftMenuPlugin extends BasePlugin {
    private mousedown?: boolean;
    private root?: PluginRenderRoot;
    private preBlockId: string;
    private hideTimer: number;

    private _blockInfo: Subject<BlockDomInfo | undefined> = new Subject();
    private _lineInfo: LineInfoSubject = new Subject();

    public static override get pluginName(): string {
        return 'left-menu';
    }

    public override init(): void {
        this.hooks.addHook(
            HookType.AFTER_ON_NODE_MOUSE_MOVE,
            this._handleMouseMove
        );
        this.hooks.addHook(
            HookType.ON_ROOTNODE_MOUSE_DOWN,
            this._handleMouseDown
        );
        this.hooks.addHook(
            HookType.ON_ROOTNODE_MOUSE_LEAVE,
            this._handleRootMouseLeave,
            this
        );
        this.hooks.addHook(HookType.ON_ROOTNODE_MOUSE_UP, this._handleMouseUp);
        this.hooks.addHook(
            HookType.AFTER_ON_NODE_DRAG_OVER,
            this._handleDragOverBlockNode
        );
        this.hooks.addHook(HookType.ON_ROOT_NODE_KEYDOWN, this._handleKeyDown);
        this.hooks.addHook(HookType.ON_ROOTNODE_DROP, this._onDrop);
    }

    private _handleRootMouseLeave() {
        this._hideLeftMenu();
    }
    private _onDrop = () => {
        this.preBlockId = '';
        this._lineInfo.next(undefined);
    };
    private _handleDragOverBlockNode = async (
        event: React.DragEvent<Element>,
        blockInfo: BlockDomInfo
    ) => {
        const { type, dom, blockId } = blockInfo;
        if (this.editor.dragDropManager.isDragBlock(event)) {
            event.preventDefault();
            if (ignoreBlockTypes.includes(type)) {
                return;
            }
            const direction =
                await this.editor.dragDropManager.checkBlockDragTypes(
                    event,
                    dom,
                    blockId
                );
            this._lineInfo.next({ direction, blockInfo });
        }
    };

    private _handleMouseMove = async (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        node: BlockDomInfo
    ) => {
        if (!this.hideTimer) {
            this.hideTimer = window.setTimeout(() => {
                if (this.mousedown) {
                    this._hideLeftMenu();
                    return;
                }
                this.hideTimer = 0;
            }, 300);
        }
        if (this.editor.readonly) {
            this._hideLeftMenu();
            return;
        }
        if (node.blockId !== this.preBlockId) {
            if (node.dom) {
                const mousePoint = new Point(e.clientX, e.clientY);
                const children = await (
                    await this.editor.getBlockById(node.blockId)
                ).children();
                // if mouse point is between the first and last child do not show left menu
                if (children.length) {
                    const firstChildren = children[0];
                    const lastChildren = last(children);
                    if (firstChildren.dom && lastChildren.dom) {
                        const firstChildrenRect = domToRect(firstChildren.dom);
                        const lastChildrenRect = domToRect(lastChildren.dom);
                        if (
                            firstChildrenRect.top < mousePoint.y &&
                            lastChildrenRect.bottom > mousePoint.y
                        ) {
                            return;
                        }
                    }
                }
            }
            this.preBlockId = node.blockId;
            this._showLeftMenu(node);
        }
    };

    private _handleMouseUp(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        node: BlockDomInfo
    ) {
        if (this.hideTimer) {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = 0;
        }
        this.mousedown = false;
    }

    private _handleMouseDown = (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        node: BlockDomInfo
    ) => {
        this.mousedown = true;
    };

    private _hideLeftMenu = (): void => {
        this._blockInfo.next(undefined);
    };

    private _handleKeyDown = () => {
        this._hideLeftMenu();
    };

    private _showLeftMenu = (blockInfo: BlockDomInfo): void => {
        if (ignoreBlockTypes.includes(blockInfo.type)) {
            return;
        }
        this._blockInfo.next(blockInfo);
    };

    protected override on_render(): void {
        this.root = new PluginRenderRoot({
            name: LeftMenuPlugin.pluginName,
            render: (...args) => {
                return this.editor.reactRenderRoot?.render(...args);
            },
        });
        this.root.mount();
        this.root.render(
            <StrictMode>
                <LeftMenuDraggable
                    key={Math.random() + ''}
                    defaultVisible={true}
                    editor={this.editor}
                    hooks={this.hooks}
                    blockInfo={this._blockInfo}
                    lineInfo={this._lineInfo}
                />
            </StrictMode>
        );
    }

    public override dispose(): void {
        // TODO: rxjs
        this.root?.unmount();
        super.dispose();
    }
}
