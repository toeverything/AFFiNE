import { PagesIcon } from '@toeverything/components/icons';
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Descendant } from 'slate';
import { RenderElementProps } from 'slate-react';

export type DoubleLinkElement = {
    type: 'link';
    linkType: 'doubleLink';
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

    const displayValue = doubleLinkElement.children
        .map((item: any) => item.text)
        .join('');

    return (
        <span onClick={handleClickLinkText}>
            <a {...attributes} style={{ cursor: 'pointer' }}>
                <PagesIcon
                    style={{ verticalAlign: 'middle', height: '20px' }}
                />
                <span>
                    {children}
                    {displayValue}
                </span>
            </a>
        </span>
    );
};
