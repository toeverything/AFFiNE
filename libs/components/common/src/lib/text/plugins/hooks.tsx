import { useMemo } from 'react';

export const useRichStyle = function (element: any) {
    const richStyles = useMemo(() => {
        const richStyles: { [key: string]: boolean } = {};
        if (element.bold) {
            richStyles['bold'] = true;
        }
        if (element.italic) {
            richStyles['italic'] = true;
        }
        if (element.underline) {
            richStyles['underline'] = true;
        }
        if (element.strikethrough) {
            richStyles['strikethrough'] = true;
        }
        return richStyles;
    }, [element]);

    return richStyles;
};
