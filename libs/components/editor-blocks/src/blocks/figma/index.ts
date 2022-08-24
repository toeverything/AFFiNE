import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { FigmaView } from './FigmaView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

export class FigmaBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.figma;
    View = FigmaView;

    override async block2html({ block }: Block2HtmlProps) {
        const figmaUrl = block.getProperty('embedLink')?.value;
        return `<p><a href="${figmaUrl}">${figmaUrl}</a></p>`;
    }
}
