import { useMemo } from 'react';

import { CommandMenuCategories } from './config';

type MenuCategoriesProps = {
    currentCategories: CommandMenuCategories;
    onSetCategories?: (categories: CommandMenuCategories) => void;
    categories: Array<CommandMenuCategories>;
};

export const MenuCategories = ({
    currentCategories,
    onSetCategories,
    categories,
}: MenuCategoriesProps) => {
    const categories_data = useMemo(() => {
        return [
            {
                type: CommandMenuCategories.pages,
                text: 'PAGES',
            },
            {
                type: CommandMenuCategories.typesetting,
                text: 'TYPESETTING',
            },
            {
                type: CommandMenuCategories.lists,
                text: 'LISTS',
            },
            {
                type: CommandMenuCategories.media,
                text: 'MEDIA',
            },
            {
                type: CommandMenuCategories.blocks,
                text: 'BLOCKS',
            },
        ];
    }, []);

    const handle_click = (type: CommandMenuCategories) => {
        onSetCategories && onSetCategories(type);
    };

    return (
        <div style={rootContainerStyle}>
            {categories_data.map((menu_category, index) => {
                const { type, text } = menu_category;
                return categories.includes(type) ? (
                    <button
                        style={{
                            ...categoryItemStyle,
                            ...(currentCategories === type
                                ? activeItemStyle
                                : {}),
                        }}
                        key={type}
                        onClick={() => {
                            handle_click(type);
                        }}
                    >
                        {text}
                    </button>
                ) : null;
            })}
        </div>
    );
};

const rootContainerStyle: React.CSSProperties = {
    minWidth: '120px',
    marginTop: '6px',
};

const categoryItemStyle: React.CSSProperties = {
    display: 'flex',
    width: '120px',
    paddingLeft: '12px',
    paddingTop: '6px',
    paddingBottom: '6px',
    borderRadius: '5px',
    color: '#98ACBD',
    fontSize: '12px',
    lineHeight: '14px',
    fontFamily: 'Helvetica,Arial,"Microsoft Yahei",SimHei,sans-serif',
    textAlign: 'justify',
    letterSpacing: '1.5px',
};

const activeItemStyle: React.CSSProperties = {
    minWidth: '120px',
    marginTop: '6px',
};
