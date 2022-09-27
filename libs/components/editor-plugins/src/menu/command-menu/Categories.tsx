import { useMemo } from 'react';
import style9 from 'style9';

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
        <div className={styles('rootContainer')}>
            {categories_data.map((menu_category, index) => {
                const { type, text } = menu_category;
                return categories.includes(type) ? (
                    <button
                        className={styles({
                            categoryItem: true,
                            activeItem: currentCategories === type,
                        })}
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

const styles = style9.create({
    rootContainer: {
        minWidth: '120px',
        marginTop: '6px',
    },
    categoryItem: {
        display: 'flex',
        width: '120px',
        paddingLeft: '12px',
        paddingTop: '6px',
        paddingBottom: '6px',
        borderRadius: '5px',
        color: '#98ACBD',
        fontSize: '12px',
        lineHeight: '14px',
        textAlign: 'justify',
        letterSpacing: '1.5px',
    },
    activeItem: {
        backgroundColor: 'rgba(152, 172, 189, 0.1)',
    },
});
