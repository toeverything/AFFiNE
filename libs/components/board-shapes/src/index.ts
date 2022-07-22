import { TDShape, TDShapeType } from '@toeverything/components/board-types';
import type { TDShapeUtil } from './TDShapeUtil';
import { RectangleUtil } from './rectangle-util';
import { TriangleUtil } from './triangle-util';
import { HexagonUtil } from './hexagon-util';
import { ArrowUtil } from './arrow-util';
import { DrawUtil } from './draw-util';
import { EllipseUtil } from './ellipse-util';
import { GroupUtil } from './group-util';
import { ImageUtil } from './image-util';
import { VideoUtil } from './video-util';
import { EditorUtil } from './editor-util';
import { PentagramUtil } from './pentagram-util';
import { WhiteArrowUtil } from './white-arrow-util';
import { FrameUtil } from './frame-util';

export { TDShapeUtil } from './TDShapeUtil';

export const Rectangle = new RectangleUtil();
export const Triangle = new TriangleUtil();
export const Hexagon = new HexagonUtil();
export const Pentagram = new PentagramUtil();
export const WhiteArrow = new WhiteArrowUtil();
export const Arrow = new ArrowUtil();
export const Draw = new DrawUtil();
export const Ellipse = new EllipseUtil();
const Group = new GroupUtil();
const Image = new ImageUtil();
const Video = new VideoUtil();
export const Frame = new FrameUtil();

export const Editor = new EditorUtil();

export const shapeUtils = {
    [TDShapeType.Rectangle]: Rectangle,
    [TDShapeType.Frame]: Frame,
    [TDShapeType.Triangle]: Triangle,
    [TDShapeType.Pentagram]: Pentagram,
    [TDShapeType.Hexagon]: Hexagon,
    [TDShapeType.WhiteArrow]: WhiteArrow,
    [TDShapeType.Arrow]: Arrow,
    [TDShapeType.Draw]: Draw,
    [TDShapeType.Ellipse]: Ellipse,
    [TDShapeType.Group]: Group,
    [TDShapeType.Image]: Image,
    [TDShapeType.Video]: Video,
    [TDShapeType.Editor]: Editor,
};

export const getShapeUtil = <T extends TDShape>(
    shape: T | T['type']
): TDShapeUtil<T> | undefined => {
    if (typeof shape === 'string')
        return shapeUtils[shape] as unknown as TDShapeUtil<T>;
    return shapeUtils[shape.type] as unknown as TDShapeUtil<T>;
};

export { getTrianglePoints } from './triangle-util/triangle-helpers';
export { defaultStyle } from './shared/shape-styles';
export { clearPrevSize } from './shared/get-text-size';
