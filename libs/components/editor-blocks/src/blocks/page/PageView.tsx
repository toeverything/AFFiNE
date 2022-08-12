import { FC, useRef, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { BackLink, TextProps } from '@toeverything/components/common';
import {
    RenderBlockChildren,
    BlockPendantProvider,
} from '@toeverything/components/editor-core';
import { ContentColumnValue } from '@toeverything/datasource/db-service';
import { CreateView } from '@toeverything/framework/virgo';
import { Theme, styled } from '@toeverything/components/ui';

import {
    TextManage,
    type ExtendedTextUtils,
} from '../../components/text-manage';

export const PageView = ({ block, editor }: CreateView) => {
    const { workspace_id } = useParams();
    const textRef = useRef<ExtendedTextUtils>(null);
    const [backLinks, setBackLinks] =
        useState<Awaited<ReturnType<typeof editor.search>>>();

    const properties = useMemo(() => block.getProperties(), [block]);
    const onTextEnter: TextProps['handleEnter'] = async props => {
        const { splitContents } = props;
        if (!splitContents) {
            return false;
        }
        const { contentBeforeSelection, contentAfterSelection } = splitContents;
        const before = [...contentBeforeSelection.content];
        const after = [...contentAfterSelection.content];

        const firstChild = await block.firstChild();
        const maybeGroupBlock =
            firstChild && firstChild.type === 'group' ? firstChild : null;
        const groupBlock =
            maybeGroupBlock ?? (await editor.createBlock('group', block.id));
        if (!groupBlock) {
            throw new Error('Failed to create group block');
        }

        const childBlock = await editor.createBlock('text', groupBlock.id);
        if (!childBlock) {
            throw new Error('Failed to create text block');
        }
        await childBlock.setProperties({
            text: { value: after } as ContentColumnValue,
        });

        await block.setProperties({
            text: { value: before } as ContentColumnValue,
        });
        await groupBlock.prepend(childBlock);
        editor.selectionManager.activeNodeByNodeId(childBlock.id);
        return true;
    };

    useEffect(() => {
        // const title = properties['text']?.value?.[0]?.text;
        // if (!title || !title.trim()) {
        //     try {
        //         const startSelection = text_ref.current.getStartSelection();
        //         text_ref.current.setSelection(startSelection);
        //     } catch (error) {
        //         console.error(error);
        //     }
        // }
    }, [properties]);

    useEffect(() => {
        editor
            .search({ tag: `reference:${block.id}` })
            .then(blocks => setBackLinks(blocks));
    }, [block.id, editor]);

    useEffect(() => {
        // auto focus page title by default
        editor.selectionManager.activeNodeByNodeId(block.id, 'end');
    }, [block.id, editor]);

    return (
        <PageTitleBlock>
            <BlockPendantProvider block={block}>
                <TextManage
                    alwaysShowPlaceholder
                    ref={textRef}
                    className={'title'}
                    supportMarkdown={false}
                    handleEnter={onTextEnter}
                    placeholder={'Untitled'}
                    block={block}
                    editor={editor}
                />
            </BlockPendantProvider>

            {/* TODO: add back multi block select */}
            {/* <div
                contentEditable
                className={style9(styles.content)}
                suppressContentEditableWarning
            > */}
            <BackLink blocks={backLinks} workspaceId={workspace_id} />
            {/*{block.childrenIds.map(childId => (*/}
            {/*    <RenderBlock key={childId} blockId={childId} />*/}
            {/*))}*/}
            <RenderBlockChildren block={block} />
        </PageTitleBlock>
    );
};

const PageTitleBlock = styled('div')(({ theme }) => {
    return {
        '.title': {
            fontSize: theme.affine.typography.page.fontSize,
            lineHeight: theme.affine.typography.page.lineHeight,
            fontWeight: theme.affine.typography.page.fontWeight,
        },
        '.content': {
            outline: 'none',
        },
        a: {
            color: '#3e6fdb',
        },
    };
});
