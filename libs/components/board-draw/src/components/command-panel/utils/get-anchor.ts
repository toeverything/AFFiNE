interface ShapeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const getAnchor = (rect: ShapeRect) => {
    return {
        getBoundingClientRect(): DOMRect {
            const x = rect.x;
            const y = rect.y;
            const width = rect.width;
            const height = rect.height;

            const calcRect = {
                x,
                y,
                top: y,
                left: x,
                width,
                height,
                bottom: y + height,
                right: x + width,
            };
            const jsonStr = JSON.stringify(rect);

            return {
                ...calcRect,
                toJSON() {
                    return jsonStr;
                },
            };
        },
    };
};
