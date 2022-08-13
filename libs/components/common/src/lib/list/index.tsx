import { useState } from 'react';
import { useNavigate } from 'react-router';

import {
    BaseButton,
    ListButton,
    MuiClickAwayListener,
    Popover,
    SvgIconProps,
} from '@toeverything/components/ui';
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { BlockSearchItem } from '@toeverything/datasource/jwt';

import { BlockPreview } from '../block-preview';
import { BackwardUndoIcon } from '@toeverything/components/icons';

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
    let usedItems = items.filter(item => {
        return !JSONUnsupportedBlockTypes.includes(item?.content?.id);
    });
    return (
        <div style={rootContainerStyle} className={props.className}>
            <div style={scrollContainerStyle} className={commonListContainer}>
                {usedItems?.length ? (
                    usedItems.map((item, idx) => {
                        if (item.block) {
                            return (
                                <BlockPreview
                                    style={buttonStyle}
                                    className={`item-${item.block.id}`}
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
                                    style={buttonStyle}
                                    className={`item-${id}`}
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
                                    style={separatorStyle}
                                    key={`${item.divider}${idx}-separator`}
                                    tabIndex={-1}
                                />
                            );
                        } else {
                            return null;
                        }
                    })
                ) : (
                    <span style={emptyStyle}>no search result</span>
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
                    style={backlinksButtonStyle}
                    onClick={() => set_visible(bool => !bool)}
                >
                    <BackwardUndoIcon sx={{ width: 20, height: 20 }} />
                    <span>Backlinks ({blocks.length})</span>
                </BaseButton>
            </Popover>
        </MuiClickAwayListener>
    ) : null;
};

const rootContainerStyle: React.CSSProperties = {
    width: '228px',
    overflowX: 'hidden',
    overflowY: 'hidden',
    marginTop: '6px',
    marginLeft: '5px',
};
const scrollContainerStyle: React.CSSProperties = {
    width: 'calc(100% + 25px)',
    height: '100%',
    overflowY: 'scroll',
};
const buttonStyle: React.CSSProperties = {
    width: '220px',
    borderRadius: '5px!important',
    marginTop: '0px!important',
};
const emptyStyle: React.CSSProperties = {
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
};
const separatorStyle: React.CSSProperties = {
    height: '1px',
    border: 0,
    marginTop: '8px',
    marginBottom: '8px',
    backgroundColor: 'rgba(152, 172, 189, 0.6)',
    borderColor: 'rgba(152, 172, 189, 0.6)',
};
const backlinksContainerStyle: React.CSSProperties = {
    borderRadius: '10px',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    backgroundColor: '#fff',
};
const backlinksButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
};
