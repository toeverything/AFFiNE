import { PagesIcon } from '@toeverything/components/icons';
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Descendant } from 'slate';
import { RenderElementProps } from 'slate-react';

export type DoubleLinkElement = {
    type: 'link';
    workspaceId: string;
    blockId: string;
    children: Descendant[];
    id: string;
};

export const DoubleLinkComponent = (props: RenderElementProps) => {
    const { attributes, children, element } = props;
    const doubleLinkElement = element as DoubleLinkElement;
    const navigate = useNavigate();

    const handleClickLinkText = useCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            const { workspaceId, blockId } = doubleLinkElement;
            navigate(`/${workspaceId}/${blockId}`);
        },
        [doubleLinkElement, navigate]
    );

    return (
        <span>
            <PagesIcon style={{ verticalAlign: 'middle', height: '20px' }} />
            <a
                {...attributes}
                style={{ cursor: 'pointer' }}
                href={`/${doubleLinkElement.workspaceId}/${doubleLinkElement.blockId}`}
            >
                <span onClick={handleClickLinkText}>{children}</span>
            </a>
        </span>
    );
};
