import { useMemo } from 'react';
import { ReactEditor } from 'slate-react';
import { useRichStyle } from './hooks';

export const withDate = (editor: ReactEditor) => {
    const { isInline, isVoid } = editor;

    editor.isInline = element => {
        // @ts-ignore
        return element.type === 'date' ? true : isInline(element);
    };

    editor.isVoid = element => {
        // @ts-ignore
        return element.type === 'date' ? true : isVoid(element);
    };

    return editor;
};

export const InlineDate = ({ attributes, children, element }: any) => {
    const onClick = () => {
        console.log('date click');
    };

    const richStyles = useRichStyle(element);

    const time = useMemo(() => {
        const { timeStamp } = element;
        const date = new Date(timeStamp);
        return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    }, [element]);

    return (
        <span
            {...attributes}
            contentEditable={false}
            data-cy={`${element.timeStamp}`}
            style={{
                padding: '0 2px',
                margin: '0 1px',
                verticalAlign: 'baseline',
                display: 'inline-block',
                color: 'darkgray',
                cursor: 'pointer',
                fontStyle: richStyles['italic'] ? 'italic' : 'none',
                textDecoration: `${
                    richStyles['strikethrough'] ? 'line-through' : ''
                }  ${richStyles['underline'] ? 'underline' : ''}`,
                fontWeight: richStyles['bold'] ? 'bolder' : 'normal',
            }}
            onClick={onClick}
        >
            <span style={{ opacity: 0.6 }}>@</span>
            {time}
            {children}
        </span>
    );
};
