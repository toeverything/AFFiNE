import { useState } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import {
    useOnSelect,
    BlockPendantProvider,
} from '@toeverything/components/editor-core';
import { Upload } from '../../components/upload/upload';
import { SourceView } from '../../components/source-view';
import { styled } from '@toeverything/components/ui';
import { LinkContainer } from '../../components/style-container';

const MESSAGES = {
    ADD_FIGMA_LINK: 'Add figma link',
};

interface FigmaView extends CreateView {
    figmaUrl?: string;
}
export const FigmaView = ({ block, editor }: FigmaView) => {
    const [figmaUrl, setFigmaUrl] = useState<string>(
        block.getProperty('embedLink')?.value
    );

    const onFigmaUrlChange = async (link: string) => {
        setFigmaUrl(link);
        block.setProperty('embedLink', { value: link, name: 'figma' });
    };
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });
    return (
        <BlockPendantProvider block={block}>
            <LinkContainer>
                {figmaUrl ? (
                    <SourceView
                        block={block}
                        viewType="figma"
                        link={figmaUrl}
                        isSelected={isSelect}
                    />
                ) : (
                    <Upload
                        firstCreate={block.firstCreateFlag}
                        uploadType={'figma'}
                        savaLink={onFigmaUrlChange}
                        deleteFile={() => {
                            block.remove();
                        }}
                        defaultAddBtnText={MESSAGES.ADD_FIGMA_LINK}
                        isSelected={isSelect}
                    />
                )}
            </LinkContainer>
        </BlockPendantProvider>
    );
};
