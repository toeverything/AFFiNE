import React, { useCallback, useEffect, useMemo, useState } from 'react';
import style9 from 'style9';

import { MuiClickAwayListener } from '@toeverything/components/ui';
import { Virgo, HookType, PluginHooks } from '@toeverything/framework/virgo';
import { Point } from '@toeverything/utils';

import { ReferenceMenuContainer } from './Container';
import { QueryBlocks, QueryResult } from '../../search';

export type ReferenceMenuProps = {
    editor: Virgo;
    hooks: PluginHooks;
    style?: { left: number; top: number };
};

export type RefLinkComponent = {
    type: 'reflink';
    reference: string;
};

const BEFORE_REGEX = /\[\[(.*)$/;

export const ReferenceMenu = ({ editor, hooks, style }: ReferenceMenuProps) => {
    const [is_show, set_is_show] = useState(false);
    const [block_id, set_block_id] = useState<string>();
    const [position, set_position] = useState<Point>(new Point(0, 0));

    const [search_text, set_search_text] = useState<string>('');
    const [search_blocks, set_search_blocks] = useState<QueryResult>([]);

    useEffect(() => {
        QueryBlocks(editor, search_text, result => set_search_blocks(result));
    }, [editor, search_text]);

    const search_block_ids = useMemo(
        () => Object.values(search_blocks).map(({ id }) => id),
        [search_blocks]
    );

    const handle_search = useCallback(
        async (event: React.KeyboardEvent<HTMLDivElement>) => {
            const { type, anchorNode } = editor.selection.currentSelectInfo;
            if (
                type === 'Range' &&
                anchorNode &&
                editor.blockHelper.isSelectionCollapsed(anchorNode.id)
            ) {
                const text = editor.blockHelper.getBlockTextBeforeSelection(
                    anchorNode.id
                );
                const matched = BEFORE_REGEX.exec(text)?.[1];

                if (typeof matched === 'string') {
                    if (event.key === '[') set_is_show(true);

                    set_block_id(anchorNode.id);
                    set_search_text(matched);

                    const rect =
                        editor.selection.currentSelectInfo?.browserSelection
                            ?.getRangeAt(0)
                            ?.getBoundingClientRect();
                    if (rect) {
                        set_position(new Point(rect.left, rect.top + 24));
                    }
                } else if (is_show) {
                    set_is_show(false);
                }
            }
        },
        [editor, is_show]
    );

    const handle_keyup = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => handle_search(event),
        [handle_search]
    );

    const handle_key_down = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.code === 'Escape') {
                set_is_show(false);
            }
        },
        []
    );

    useEffect(() => {
        const sub = hooks
            .get(HookType.ON_ROOT_NODE_KEYUP)
            .subscribe(handle_keyup);
        sub.add(
            hooks
                .get(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE)
                .subscribe(handle_key_down)
        );

        return () => {
            sub.unsubscribe();
        };
    }, [handle_keyup, handle_key_down, hooks]);

    const handle_selected = async (reference: string) => {
        if (block_id) {
            const { anchorNode } = editor.selection.currentSelectInfo;
            editor.blockHelper.insertReference(
                reference,
                anchorNode.id,
                editor.selection.currentSelectInfo?.browserSelection,
                -search_text.length - 2
            );
        }

        set_is_show(false);
    };

    const handle_close = () => {
        editor.blockHelper.removeSearchSlash(block_id);
    };

    return (
        <div
            className={styles('referenceMenu')}
            style={{ top: position.y, left: position.x }}
            onKeyUp={handle_keyup}
        >
            <MuiClickAwayListener onClickAway={() => set_is_show(false)}>
                <div>
                    <ReferenceMenuContainer
                        editor={editor}
                        hooks={hooks}
                        style={style}
                        isShow={is_show && !!search_text}
                        blockId={block_id}
                        onSelected={handle_selected}
                        onClose={handle_close}
                        searchBlocks={search_blocks}
                        types={search_block_ids}
                    />
                </div>
            </MuiClickAwayListener>
        </div>
    );
};

const styles = style9.create({
    referenceMenu: {
        position: 'absolute',
        zIndex: 1,
    },
});
