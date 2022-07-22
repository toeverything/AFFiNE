import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { ImageView } from './ImageView';

export class ImageBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.image;
    View = ImageView;

    // TODO: needs to download the image and then upload it to get a new link and then assign it
    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'IMG') {
            return [
                {
                    type: this.type,
                    properties: {
                        value: '',
                        url: el.getAttribute('src'),
                        name: el.getAttribute('src'),
                        size: 0,
                        type: 'link',
                    },
                    children: [],
                },
            ];
        }

        return null;
    }

    // TODO:
    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        const text = block.getProperty('text');
        const content = '';
        if (text) {
            text.value.map(text => `<span>${text}</span>`).join('');
        }
        // TODO: child
        return `<p><img src=${content}></p>`;
    }
}
