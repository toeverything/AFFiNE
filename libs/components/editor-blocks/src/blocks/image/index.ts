import {
    BaseView,
    BlockEditor,
    HTML2BlockResult,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { ImageView } from './ImageView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';
import { getRandomString } from '@toeverything/components/common';

export class ImageBlock extends BaseView {
    public override selectable = true;
    public override editable = false;
    type = Protocol.Block.Type.image;
    View = ImageView;

    // TODO: needs to download the image and then upload it to get a new link and then assign it
    override async html2block({
        element,
        editor,
    }: {
        element: Element;
        editor: BlockEditor;
    }): Promise<HTML2BlockResult> {
        if (element.tagName === 'IMG') {
            return [
                {
                    type: this.type,
                    properties: {
                        image: {
                            value: getRandomString('image'),
                            url: element.getAttribute('src'),
                            name: element.getAttribute('src'),
                            size: 0,
                            type: 'link',
                        },
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
