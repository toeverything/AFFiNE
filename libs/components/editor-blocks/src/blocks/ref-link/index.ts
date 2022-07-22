import { BaseView } from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { RefLinkView } from './ref-link-view';

export class RefLinkBlock extends BaseView {
    type = Protocol.Block.Type.reference;
    View = RefLinkView;

    override onTagging(content: any): string[] {
        return [
            `reference:${this.get_decoration<string>(content, 'reference')}`,
        ];
    }

    // TODO: html2block block2html
}
