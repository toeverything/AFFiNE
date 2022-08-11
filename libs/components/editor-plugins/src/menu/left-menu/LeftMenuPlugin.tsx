import { HookType, BlockDropPlacement } from '@toeverything/framework/virgo';
import { StrictMode } from 'react';
import { BasePlugin } from '../../base-plugin';
import { ignoreBlockTypes } from './menu-config';
import {
    LineInfoSubject,
    LeftMenuDraggable,
    BlockDomInfo,
} from './LeftMenuDraggable';
import { PluginRenderRoot } from '../../utils';
import { Subject, throttleTime } from 'rxjs';
import { domToRect, last, Point } from '@toeverything/utils';
const DRAG_THROTTLE_DELAY = 60;
export class LeftMenuPlugin extends BasePlugin {
    private _mousedown?: boolean;
    private _root?: PluginRenderRoot;
    private _hideTimer: number;

    private _blockInfo: Subject<BlockDomInfo | undefined> = new Subject();
    private _lineInfo: LineInfoSubject = new Subject();

    public static override get pluginName(): string {
        return 'left-menu';
    }

    public override init(): void {
        this.sub.add(
            this.hooks
                .get(HookType.ON_ROOTNODE_MOUSE_MOVE)
                .subscribe(this._handleMouseMove)
        );
        this.sub.add(
            this.hooks
                .get(HookType.ON_ROOTNODE_MOUSE_DOWN)
                .subscribe(this._handleMouseDown)
        );
        this.sub.add(
            this.hooks
                .get(HookType.ON_ROOTNODE_MOUSE_UP)
                .subscribe(this._handleMouseUp)
        );

        this.sub.add(
            this.hooks.get(HookType.ON_ROOTNODE_MOUSE_LEAVE).subscribe(() => {
                this._hideLeftMenu();
                this._lineInfo.next(undefined);
            })
        );
        this.sub.add(
            this.hooks.get(HookType.ON_ROOTNODE_DRAG_LEAVE).subscribe(() => {
                this.editor.dragDropManager.clearDropInfo();
                this._lineInfo.next(undefined);
            })
        );
        this.sub.add(
            this.hooks
                .get(HookType.ON_ROOT_NODE_KEYDOWN)
                .subscribe(this._hideLeftMenu)
        );
        this.sub.add(
            this.hooks.get(HookType.ON_ROOTNODE_DROP).subscribe(this._onDrop)
        );
        this.sub.add(
            this.hooks
                .get(HookType.ON_ROOTNODE_DRAG_OVER)
                .pipe(throttleTime(DRAG_THROTTLE_DELAY))
                .subscribe(this._handleRootNodeDragover)
        );
    }

    private _handleRootNodeDragover = async (
        event: React.DragEvent<Element>
    ) => {
        event.preventDefault();
        if (this.editor.dragDropManager.isDragBlock(event)) {
            const { direction, block, isOuter } =
                await this.editor.dragDropManager.checkOuterBlockDragTypes(
                    event
                );
            if (direction !== BlockDropPlacement.none && block && block.dom) {
                this._lineInfo.next({
                    direction,
                    blockInfo: {
                        block,
                        rect: block.dom.getBoundingClientRect(),
                    },
                });
            } else if (!isOuter) {
                this._handleDragOverBlockNode(event);
            } else {
                this._lineInfo.next(undefined);
            }
        }
    };

    private _onDrop = () => {
        this._lineInfo.next(undefined);
    };
    private _handleDragOverBlockNode = async (
        event: React.DragEvent<Element>
    ) => {
        event.preventDefault();
        if (!this.editor.dragDropManager.isDragBlock(event)) return;
        const block = await this.editor.getBlockByPoint(
            new Point(event.clientX, event.clientY)
        );
        if (block == null || ignoreBlockTypes.includes(block.type)) return;
        const { direction, block: targetBlock } =
            await this.editor.dragDropManager.checkBlockDragTypes(
                event,
                block.dom,
                block.id
            );
        this._lineInfo.next({
            direction,
            blockInfo: {
                block: targetBlock,
                rect: targetBlock.dom.getBoundingClientRect(),
            },
        });
    };

    private _handleMouseMove = async (
        event: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => {
        if (!this._hideTimer) {
            this._hideTimer = window.setTimeout(() => {
                if (this._mousedown) {
                    this._hideLeftMenu();
                    return;
                }
                this._hideTimer = 0;
            }, 300);
        }
        if (this.editor.readonly) {
            this._hideLeftMenu();
            return;
        }
        const node = await this.editor.getBlockByPoint(
            new Point(event.clientX, event.clientY)
        );
        if (node == null || ignoreBlockTypes.includes(node.type)) {
            return;
        }
        if (node.dom) {
            const mousePoint = new Point(event.clientX, event.clientY);
            const children = await (
                await this.editor.getBlockById(node.id)
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
        this._blockInfo.next({
            block: node,
            rect: node.dom.getBoundingClientRect(),
        });
    };

    private _handleMouseUp() {
        if (this._hideTimer) {
            window.clearTimeout(this._hideTimer);
            this._hideTimer = 0;
        }
        this._mousedown = false;
    }

    private _handleMouseDown = () => {
        this._mousedown = true;
    };

    private _hideLeftMenu = (): void => {
        this._blockInfo.next(undefined);
    };

    protected override _onRender(): void {
        this._root = new PluginRenderRoot({
            name: LeftMenuPlugin.pluginName,
            render: (...args) => {
                return this.editor.reactRenderRoot?.render(...args);
            },
        });
        this._root.mount();
        this._root.render(
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
        this._root?.unmount();
        super.dispose();
    }
}
