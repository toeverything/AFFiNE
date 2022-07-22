import { TDShapeType, TDToolType } from '@toeverything/components/board-types';
import { ArrowTool } from './arrow-tool';
import { LineTool } from './line-tool';
import { DrawTool } from './draw-tool';
import { PencilTool } from './pencil-tool';
import { HighlightTool } from './highlight-tool';
import { EllipseTool } from './ellipse-tool';
import { RectangleTool } from './rectangle-tool';
import { TriangleTool } from './triangle-tool';
import { SelectTool } from './select-tool';
import { EraseTool } from './erase-tool';
import { EditorTool } from './editor-tool';
import { HexagonTool } from './hexagon-tool';
import { PentagramTool } from './pentagram-tool';
import { WhiteArrowTool } from './white-arrow-tool';
import { LaserTool } from './laser-tool';
import { HandDrawTool } from './hand-draw';
import { FrameTool } from './frame-tool/frame-tool';

export interface ToolsMap {
    select: typeof SelectTool;
    erase: typeof EraseTool;
    [TDShapeType.Draw]: typeof DrawTool;
    [TDShapeType.Ellipse]: typeof EllipseTool;
    [TDShapeType.Rectangle]: typeof RectangleTool;
    [TDShapeType.Triangle]: typeof TriangleTool;
    [TDShapeType.Hexagon]: typeof HexagonTool;
    [TDShapeType.Pentagram]: typeof PentagramTool;
    [TDShapeType.Line]: typeof LineTool;
    [TDShapeType.Arrow]: typeof ArrowTool;
    [TDShapeType.Pencil]: typeof PencilTool;
    [TDShapeType.Highlight]: typeof HighlightTool;
    [TDShapeType.Editor]: typeof EditorTool;
    [TDShapeType.WhiteArrow]: typeof WhiteArrowTool;
    [TDShapeType.HandDraw]: typeof HandDrawTool;
    [TDShapeType.Laser]: typeof LaserTool;
    [TDShapeType.Frame]: typeof FrameTool;
}

export type ToolOfType<K extends TDToolType> = ToolsMap[K];

export type ArgsOfType<K extends TDToolType> = ConstructorParameters<
    ToolOfType<K>
>;

export const tools: { [K in TDToolType]: ToolsMap[K] } = {
    select: SelectTool,
    erase: EraseTool,
    [TDShapeType.Draw]: DrawTool,
    [TDShapeType.Pencil]: PencilTool,
    [TDShapeType.Highlight]: HighlightTool,
    [TDShapeType.Ellipse]: EllipseTool,
    [TDShapeType.Rectangle]: RectangleTool,
    [TDShapeType.Triangle]: TriangleTool,
    [TDShapeType.Pentagram]: PentagramTool,
    [TDShapeType.Line]: LineTool,
    [TDShapeType.Arrow]: ArrowTool,
    [TDShapeType.Editor]: EditorTool,
    [TDShapeType.Hexagon]: HexagonTool,
    [TDShapeType.WhiteArrow]: WhiteArrowTool,
    [TDShapeType.Laser]: LaserTool,
    [TDShapeType.HandDraw]: HandDrawTool,
    [TDShapeType.Frame]: FrameTool,
};
