import { BackwardUndoIcon } from '@toeverything/components/icons';
import {
    BaseButton,
    ListButton,
    MuiClickAwayListener,
    Popover,
    SvgIconProps,
} from '@toeverything/components/ui';
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { BlockSearchItem } from '@toeverything/datasource/jwt';
import clsx from 'clsx';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import style9 from 'style9';
import { BlockPreview } from '../block-preview';

export const commonListContainer = 'commonListContainer';

type Content = {
    id: string;
    content: string;
    icon: (prop: SvgIconProps) => JSX.Element;
};

export type CommonListItem = {
    divider?: string;
    content?: Content;
    block?: BlockSearchItem;
    renderCustom?: (props: CommonListItem) => JSX.Element;
};

type MenuItemsProps = {
    className?: string;
    items: CommonListItem[];
    currentItem: string;
    setCurrentItem: (itemType: string) => void;
    onSelected?: (item: string) => void;
};

export const CommonList = (props: MenuItemsProps) => {
    const { items, currentItem, setCurrentItem, onSelected } = props;
    // const JSONUnsupportedBlockTypes = useFlag('JSONUnsupportedBlockTypes', [
    //     'page',
    // ]);
    // TODO Insert bidirectional link to be developed
    const JSONUnsupportedBlockTypes = ['page'];
    const usedItems = items.filter(item => {
        return !JSONUnsupportedBlockTypes.includes(item?.content?.id);
    });
    return (
        <div className={clsx(styles('root_container'), props.className)}>
            <div
                className={clsx([
                    styles('scroll_container'),
                    commonListContainer,
                ])}
            >
                {usedItems?.length ? (
                    usedItems.map((item, idx) => {
                        if (item.block) {
                            return (
                                <BlockPreview
                                    className={clsx(
                                        styles('button'),
                                        `item-${item.block.id}`
                                    )}
                                    key={item.block.id}
                                    block={item.block}
                                    onClick={() => onSelected?.(item.block.id)}
                                    onMouseOver={() =>
                                        setCurrentItem?.(item.block.id)
                                    }
                                    hover={currentItem === item.block.id}
                                />
                            );
                        } else if (item.content) {
                            const { id, content, icon } = item.content;
                            return (
                                <ListButton
                                    key={id}
                                    className={clsx(
                                        styles('button'),
                                        `item-${id}`
                                    )}
                                    onClick={() => onSelected?.(id)}
                                    onMouseOver={() => setCurrentItem?.(id)}
                                    hover={currentItem === id}
                                    content={content}
                                    icon={icon}
                                />
                            );
                        } else if (item.divider) {
                            return (
                                <hr
                                    className={styles('separator')}
                                    key={`${item.divider}${idx}-separator`}
                                    tabIndex={-1}
                                />
                            );
                        } else {
                            return null;
                        }
                    })
                ) : (
                    <span className={styles('empty')}>no search result</span>
                )}
            </div>
        </div>
    );
};

type BackLinkProps = {
    blocks?: BlockSearchItem[];
    workspaceId: string;
};

export const BackLink = (props: BackLinkProps) => {
    const { blocks } = props;

    const navigate = useNavigate();

    const [item, set_item] = useState<string>();
    const [visible, set_visible] = useState(false);

    return blocks?.length ? (
        <MuiClickAwayListener onClickAway={() => set_visible(false)}>
            <Popover
                defaultVisible={visible}
                placement="bottom-start"
                content={
                    <CommonList
                        items={blocks.map(block => ({ block }))}
                        currentItem={item}
                        setCurrentItem={set_item}
                        onSelected={id =>
                            navigate(`/${props.workspaceId}/${id}`)
                        }
                    />
                }
            >
                <BaseButton
                    className={styles('backlinks_button')}
                    onClick={() => set_visible(bool => !bool)}
                >
                    <BackwardUndoIcon sx={{ width: 20, height: 20 }} />
                    <span>Backlinks ({blocks.length})</span>
                </BaseButton>
            </Popover>
        </MuiClickAwayListener>
    ) : null;
};

const styles = style9.create({
    root_container: {
        width: '228px',
        overflowX: 'hidden',
        overflowY: 'hidden',
        marginTop: '6px',
        marginLeft: '5px',
    },
    scroll_container: {
        width: 'calc(100% + 25px)',
        height: '100%',
        overflowY: 'scroll',
    },
    button: {
        width: '220px',
        borderRadius: '5px!important',
        marginTop: '0px!important',
    },
    empty: {
        display: 'inline-flex',
        width: '220px',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '15px',
        lineHeight: '17px',
        textAlign: 'justify',
        letterSpacing: '1.5px',
        color: '#4C6275',
    },
    separator: {
        height: '1px',
        border: 0,
        marginTop: '8px',
        marginBottom: '8px',
        backgroundColor: 'rgba(152, 172, 189, 0.6)',
        borderColor: 'rgba(152, 172, 189, 0.6)',
    },
    backlinks_container: {
        borderRadius: '10px',
        boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
        backgroundColor: '#fff',
    },
    backlinks_button: {
        display: 'flex',
        alignItems: 'center',
    },
});
