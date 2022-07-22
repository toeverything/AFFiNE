export class Point {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public equals({ x, y }: Point) {
        return this.x === x && this.y === y;
    }

    public xDistance({ x }: Point) {
        return this.x - x;
    }

    public yDistance({ y }: Point) {
        return this.y - y;
    }

    public xDistanceAbsolute(point: Point) {
        return Math.abs(this.xDistance(point));
    }

    public yDistanceAbsolute(point: Point) {
        return Math.abs(this.yDistance(point));
    }

    public distance(point: Point) {
        return Math.sqrt(
            Math.pow(this.xDistance(point), 2) +
                Math.pow(this.yDistance(point), 2)
        );
    }
}

export class Rect {
    private _left: number;
    private _top: number;
    private _right: number;
    private _bottom: number;

    constructor(left: number, top: number, right: number, bottom: number) {
        const [physicTop, physicBottom] =
            top <= bottom ? [top, bottom] : [bottom, top];
        const [physicLeft, physicRight] =
            left <= right ? [left, right] : [right, left];
        this._top = physicTop;
        this._right = physicRight;
        this._left = physicLeft;
        this._bottom = physicBottom;
    }

    get width() {
        return Math.abs(this._left - this._right);
    }

    get height() {
        return Math.abs(this._bottom - this._top);
    }

    get top() {
        return this._top;
    }

    get left() {
        return this._left;
    }

    get bottom() {
        return this._bottom;
    }

    get right() {
        return this._right;
    }

    equals({ top, left, bottom, right }: Rect) {
        return (
            top === this._top &&
            bottom === this._bottom &&
            left === this._left &&
            right === this._right
        );
    }

    isContainPoint({ x, y }: Point) {
        return (
            y >= this._top &&
            y <= this._bottom &&
            x >= this.left &&
            x <= this._right
        );
    }

    isContain({ top, left, bottom, right }: Rect) {
        return (
            top >= this._top &&
            top <= this._bottom &&
            bottom >= this._top &&
            bottom <= this._bottom &&
            left >= this._left &&
            left <= this.right &&
            right >= this.left &&
            right <= this._right
        );
    }

    isIntersect(rect: Rect) {
        const { left: x1, top: y1, width: w1, height: h1 } = rect;
        const { left: x2, top: y2, width: w2, height: h2 } = this;
        const maxX = x1 + w1 >= x2 + w2 ? x1 + w1 : x2 + w2;
        const maxY = y1 + h1 >= y2 + h2 ? y1 + h1 : y2 + h2;
        const minX = x1 <= x2 ? x1 : x2;
        const minY = y1 <= y2 ? y1 : y2;
        if (maxX - minX <= w1 + w2 && maxY - minY <= h1 + h2) {
            return true;
        } else {
            return false;
        }
    }

    isPointDown({ y }: Point) {
        return this.bottom < y;
    }

    isPointUp({ y }: Point) {
        return y < this.top;
    }

    isPointLeft({ x }: Point) {
        return x < this.left;
    }

    isPointRight({ x }: Point) {
        return x > this.right;
    }

    fromNewLeft(left: number) {
        this._left = left;
        return new Rect(left, this.top, this.right, this.bottom);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    static fromLTRB(left: number, top: number, right: number, bottom: number) {
        return new Rect(left, top, right, bottom);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    static fromLWTH(left: number, width: number, top: number, height: number) {
        return new Rect(left, top, left + width, top + height);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    static fromPoints(startPoint: Point, endPoint: Point) {
        const { y: top, x: left } = startPoint;
        const { y: bottom, x: right } = endPoint;
        return Rect.fromLTRB(left, top, right, bottom);
    }
}

export const pointsToRect = (startPoint: Point, endPoint: Point) => {
    const { y: top, x: left } = startPoint;
    const { y: bottom, x: right } = endPoint;
    return Rect.fromLTRB(left, top, right, bottom);
};

export const domToRect = (dom: HTMLElement) => {
    const { top, width, left, height } = dom.getBoundingClientRect();
    return Rect.fromLWTH(left, width, top, height);
};
