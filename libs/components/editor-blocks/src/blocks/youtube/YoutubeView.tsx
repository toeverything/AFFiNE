import { FC, useState } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import { Upload } from '../../components/upload/upload';
import { SourceView } from '../../components/source-view';
import { LinkContainer } from '../../components/style-container';
import { useOnSelect } from '@toeverything/components/editor-core';

const _messages = {
    addYoutubeLink: 'Add youtube link',
};

type YoutubeView = CreateView;
export const YoutubeView: FC<YoutubeView> = ({ block }) => {
    const [youtubeUrl, setYoutubeUrl] = useState<string>(
        block.getProperty('embedLink')?.value
    );

    const onYoutubeUrlChange = async (link: string) => {
        setYoutubeUrl(link);
        block.setProperty('embedLink', { value: link, name: 'youtube' });
    };
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });
    return (
        <LinkContainer>
            {youtubeUrl ? (
                <SourceView
                    block={block}
                    isSelected={isSelect}
                    viewType="youtube"
                    link={youtubeUrl}
                />
            ) : (
                <Upload
                    firstCreate={block.firstCreateFlag}
                    uploadType={'youtube'}
                    savaLink={onYoutubeUrlChange}
                    deleteFile={() => {
                        block.remove();
                    }}
                    defaultAddBtnText={_messages.addYoutubeLink}
                    isSelected={isSelect}
                />
            )}
        </LinkContainer>
    );
};
