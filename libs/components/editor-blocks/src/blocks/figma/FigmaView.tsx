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
        <BlockPendantProvider editor={editor} block={block}>
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
