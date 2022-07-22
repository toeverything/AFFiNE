import { BaseView } from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { TocView } from './toc-view';

export class TocBlock extends BaseView {
    type = Protocol.Block.Type.toc;
    View = TocView;

    // TODO: html2block block2html
}
