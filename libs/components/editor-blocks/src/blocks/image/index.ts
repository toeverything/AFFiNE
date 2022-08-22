import { BaseView } from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { ImageView } from './ImageView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

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

    override async block2html({ block, editor }: Block2HtmlProps) {
        const textValue = block.getProperty('text');
        const content = '';
        // TODO: text.value should export with style??
        const figcaption = (textValue?.value ?? [])
            .map(({ text }) => `<span>${text}</span>`)
            .join('');
        return `<figure><img src="${content}" alt="${figcaption}"/><figcaption>${figcaption}<figcaption/></figure>`;
    }
}
