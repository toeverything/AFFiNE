import {
    BlockPendantProvider,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { CreateView } from '@toeverything/framework/virgo';
import { useState } from 'react';
import { SourceView } from '../../components/source-view';
import { LinkContainer } from '../../components/style-container';
import { Upload } from '../../components/upload/upload';

const MESSAGES = {
    ADD_EMBED_LINK: 'Add embed link',
};

type EmbedLinkView = CreateView;
export const EmbedLinkView = (props: EmbedLinkView) => {
    const { block, editor } = props;
    const [isSelect, setIsSelect] = useState(false);

    const [embedLinkUrl, setEmbedLinkUrl] = useState<string>(
        block.getProperty('embedLink')?.value
    );

    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });

    const onEmbedLinkUrlChange = async (link: string) => {
        const DEMO_URL = 'https://affine.pro/';
        const value = link ? link : DEMO_URL;
        setEmbedLinkUrl(value);
        block.setProperty('embedLink', { value: value, name: 'embedLink' });
    };

    return (
        <BlockPendantProvider block={block}>
            <LinkContainer>
                {embedLinkUrl ? (
                    <SourceView
                        block={block}
                        isSelected={isSelect}
                        viewType="embedLink"
                        link={embedLinkUrl}
                    />
                ) : (
                    <Upload
                        firstCreate={block.firstCreateFlag}
                        uploadType={'embedLink'}
                        savaLink={onEmbedLinkUrlChange}
                        defaultAddBtnText={MESSAGES.ADD_EMBED_LINK}
                        isSelected={isSelect}
                    />
                )}
            </LinkContainer>
        </BlockPendantProvider>
    );
};
