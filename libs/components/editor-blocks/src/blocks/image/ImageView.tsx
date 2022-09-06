import {
    BlockPendantProvider,
    useCurrentView,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import { CreateView } from '@toeverything/framework/virgo';
import { useEffect, useRef, useState } from 'react';
import { Image as SourceView } from '../../components/ImageView';
import { Upload } from '../../components/upload/upload';
import { SCENE_CONFIG } from '../group/config';
import './styles.css';
const MESSAGES = {
    ADD_AN_IMAGE: 'Add an image',
};
interface ImageView extends CreateView {
    imageFile?: File;
}
const ImageBlock = styled('div')({
    position: 'relative',
    marginTop: '10px',
    '.option': {
        position: 'absolute',
        background: 'rgba(0,0,0,.4)',
        height: '30px',
        width: '100%',
        textAlign: 'right',
        top: '-30px',
        color: '#fff',
        padding: '4px',
        transition: 'top .5s',
    },
    '&:hover': {
        '.option': {
            top: '0px',
        },
    },
    '.img': {
        width: '100%',
    },
    '.progress': {},
});
const ImageShade = styled('div')(({ theme }) => {
    return {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 2,
        right: 0,
        background: 'transparent',
    };
});

const KanbanImageContainer = styled('div')<{ isSelected: boolean }>(
    ({ theme, isSelected }) => {
        return {
            display: 'flex',
            borderRadius: theme.affine.shape.xsBorderRadius,
            background: isSelected ? 'rgba(152, 172, 189, 0.1)' : 'transparent',
            padding: '8px',
            // border: `2px solid ${
            //     isSelected ? theme.affine.palette.primary : '#e0e0e0'
            // }`,
        };
    }
);
export const ImageView = ({ block, editor }: ImageView) => {
    const workspace = editor.workspace;
    const [imgUrl, setImageUrl] = useState<string>();
    const [imgWidth, setImgWidth] = useState<number>(0);
    const [ratio, setRatio] = useState<number>(0);
    const resizeBox = useRef(null);
    const [currentView] = useCurrentView();
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });

    const imgLoad = (url: string) => {
        const boxWidth = resizeBox.current.offsetWidth;

        const imageStyle = block.getProperty('image_style');
        if (imageStyle?.width) {
            setRatio(imageStyle.width / imageStyle.height);
            setImgWidth(imageStyle.width);
            setImageUrl(url);
            return;
        }
        const img = new Image();
        img.src = url;
        // load complete execution
        img.onload = async () => {
            const imgRadio = img.width / img.height;

            if (img.width >= boxWidth - 20) {
                img.width = boxWidth - 20;
            }
            img.height = img.width / imgRadio;

            block.setProperty('image_style', {
                width: img.width,
                height: img.height,
            });
            setImgWidth(img.width);
            setImageUrl(url);
            setRatio(imgRadio);
        };
        img.onerror = e => {
            console.log(e);
        };
    };
    useEffect(() => {
        const imageInfo = block.getProperty('image');
        const imageBlockId = imageInfo?.value;
        const imageInfoUrl = imageInfo?.url;

        if (imageInfoUrl) {
            imgLoad(imageInfoUrl);
            return;
        }
        if (imageBlockId) {
            services.api.file.get(imageBlockId, workspace).then(fileInfo => {
                imgLoad(fileInfo.url);
            });
        }
    }, [workspace]);

    const downRef = useRef(null);
    const onFileChange = async (file: File) => {
        const result = await services.api.file.create({
            workspace: editor.workspace,
            file: file,
        });
        imgLoad(result.url);
        block.setProperty('image', {
            value: result.id,
            name: file.name,
            size: file.size,
            type: file.type,
        });
    };
    const deleteFile = () => {
        block.remove();
    };
    const savaLink = (link: string) => {
        imgLoad(link);
        block.setProperty('image', {
            value: '',
            url: link,
            name: link,
            size: 0,
            type: 'link',
        });
    };
    const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
        await editor.selectionManager.setSelectedNodesIds([block.id]);
        await editor.selectionManager.activeNodeByNodeId(block.id, 'end');
    };
    const down_file = () => {
        if (downRef) {
            downRef.current.click();
        }
    };

    return (
        <BlockPendantProvider editor={editor} block={block}>
            <ImageBlock>
                <div style={{ position: 'relative' }} ref={resizeBox}>
                    {!isSelect ? <ImageShade onClick={handleClick} /> : null}
                    {imgUrl ? (
                        <div
                            onMouseDown={e => {
                                // e.nativeEvent.stopPropagation();
                                e.stopPropagation();
                            }}
                        >
                            {currentView.type === SCENE_CONFIG.PAGE ? (
                                <SourceView
                                    block={block}
                                    viewStyle={{
                                        width: imgWidth,
                                        maxWidth:
                                            resizeBox.current.offsetWidth - 20,
                                        minWidth: 32,
                                        ratio: ratio,
                                    }}
                                    isSelected={isSelect}
                                    link={imgUrl}
                                />
                            ) : (
                                <KanbanImageContainer isSelected={isSelect}>
                                    <img width={'100%'} src={imgUrl} alt="" />
                                </KanbanImageContainer>
                            )}
                        </div>
                    ) : (
                        // </ResizableBox>
                        <Upload
                            firstCreate={block.firstCreateFlag}
                            uploadType={'image'}
                            fileChange={onFileChange}
                            deleteFile={deleteFile}
                            savaLink={savaLink}
                            isSelected={isSelect}
                            defaultAddBtnText={MESSAGES.ADD_AN_IMAGE}
                            accept={
                                'image/gif,image/jpeg,image/jpg,image/png,image/svg'
                            }
                        />
                    )}
                    {/* <div>
                    <DownloadIcon
                        onClick={down_file}
                        className="delete-icon"
                        fontSize="small"
                        sx={{
                            color: '#000',
                            cursor: 'pointer',
                            marginRight: '10px'
                        }}
                    ></DownloadIcon>
                    <DeleteSweepOutlinedIcon
                        onClick={deleteFile}
                        className="delete-icon"
                        fontSize="small"
                        sx={{ color: '#000', cursor: 'pointer' }}
                    ></DeleteSweepOutlinedIcon>
                    <a
                        href={imgUrl}
                        ref={downRef}
                        style={{ display: 'none' }}
                        download="text.png"
                    ></a>
                </div> */}
                </div>
            </ImageBlock>
        </BlockPendantProvider>
    );
};
