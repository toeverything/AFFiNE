import { PagesIcon } from '@toeverything/components/icons';
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export const DoubleLinkComponent = ({ attributes, children, element }: any) => {
    const navigate = useNavigate();

    const handleClickLinkText = useCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const { workspaceId, blockId } = element;
            navigate(`/${workspaceId}/${blockId}`);
        },
        [element, navigate]
    );

    return (
        <span>
            <PagesIcon style={{ verticalAlign: 'middle', height: '20px' }} />
            <a
                {...attributes}
                style={{ cursor: 'pointer' }}
                href={`/${element.workspaceId}/${element.blockId}`}
            >
                <span onClick={handleClickLinkText}>{children}</span>
            </a>
        </span>
    );
};
