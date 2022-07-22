import { FC, useEffect, useState } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import {
    is_heading_child_type,
    get_heading_child_title,
    get_heading_child_level,
} from './toc-util';
import { MenuItem } from './types';
import { styled } from '@toeverything/components/ui';
const INITIAL_LIST: MenuItem[] = [];
const MESSAGES = {
    NO_HEADINGS_FOUND: 'No headings found',
};
export const TocView: FC<CreateView> = ({ block, editor }) => {
    const [list, setList] = useState(INITIAL_LIST);
    useEffect(() => {
        const sync_toc = async () => {
            const parent_block = await block.parent();
            const parent_children = await parent_block.children();
            const tmp_list: MenuItem[] = [];
            parent_children.forEach(child => {
                if (is_heading_child_type(child)) {
                    tmp_list.push({
                        id: child.id,
                        title: get_heading_child_title(child),
                        level: get_heading_child_level(child),
                    });
                }
            });
            //TODO  observe block change , timely update tmp_list
            setList(tmp_list);
        };
        sync_toc();
    }, [block, block.parent]);

    return (
        <ToContainer>
            {list.length ? (
                <ul className={'menu'}>
                    {list.map((menu, index) => (
                        <li
                            key={menu.id}
                            className={'menuItem'}
                            style={{
                                paddingLeft: (menu.level - 1) * 20 + 'px',
                            }}
                        >
                            {menu.title}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className={'noHeadingsFound'}>
                    {MESSAGES.NO_HEADINGS_FOUND}
                </p>
            )}
        </ToContainer>
    );
};
const ToContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    '.checkBoxContainer': {
        marginRight: '4px',
        padding: '10px 0',
        height: theme.affine.typography.body1.lineHeight,
    },
    '.menu': {
        listStyleType: 'none',
        width: '100%',
    },
    '.menuItem': {
        fontSize: '14px',
        height: '30px',
        lineHeight: '30px',
        color: 'var(--color-gray-400)',
        textDecorationLine: 'underline',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: 'var(--color-gray-100)',
        },
    },
    '.noHeadingsFound': {
        color: 'var(--color-gray-400)',
    },
}));
