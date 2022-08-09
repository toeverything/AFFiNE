import { FC, useState } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import {
    BlockPendantProvider,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { Upload } from '../../components/upload/upload';
import { SourceView } from '../../components/source-view';
import { LinkContainer } from '../../components/style-container';

const MESSAGES = {
    ADD_EMBED_LINK: 'Add embed link',
};

type EmbedLinkView = CreateView;
export const EmbedLinkView: FC<EmbedLinkView> = props => {
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
                        editorElement={props.editorElement}
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
