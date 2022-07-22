import { FC, useState, useEffect, useRef } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import { Upload } from '../../components/upload/upload';
import { services } from '@toeverything/datasource/db-service';
import { styled } from '@toeverything/components/ui';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import { Image as SourceView } from '../../components/ImageView';
import {
    useOnSelect,
    useRecastBlockScene,
    WrapperWithPendantAndDragDrop,
} from '@toeverything/components/editor-core';
import './styles.css';
import { SCENE_CONFIG } from '../group/config';
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
export const ImageView: FC<ImageView> = ({ block, editor }) => {
    const workspace = editor.workspace;
    const [imgUrl, set_image_url] = useState<string>();
    const [imgWidth, setImgWidth] = useState<number>(0);
    const [ratio, set_ratio] = useState<number>(0);
    const resize_box = useRef(null);
    const { scene } = useRecastBlockScene();
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (isSelect: boolean) => {
        setIsSelect(isSelect);
    });

    const img_load = (url: string) => {
        let boxWidth = resize_box.current.offsetWidth;

        const imageStyle = block.getProperty('image_style');
        if (imageStyle?.width) {
            set_ratio(imageStyle.width / imageStyle.height);
            setImgWidth(imageStyle.width);
            set_image_url(url);
            return;
        }
        const img = new Image();
        img.src = url;
        // load complete execution
        img.onload = async () => {
            const img_radio = img.width / img.height;

            if (img.width >= boxWidth - 20) {
                img.width = boxWidth - 20;
            }
            img.height = img.width / img_radio;

            block.setProperty('image_style', {
                width: img.width,
                height: img.height,
            });
            setImgWidth(img.width);
            set_image_url(url);
            set_ratio(img_radio);
        };
        img.onerror = e => {
            console.log(e);
        };
    };
    useEffect(() => {
        const style = window.getComputedStyle(block?.dom);
        const image_info = block.getProperty('image');
        const image_block_id = image_info?.value;
        const image_info_url = image_info?.url;

        if (image_info_url) {
            img_load(image_info_url);
            return;
        }
        if (image_block_id) {
            services.api.file.get(image_block_id, workspace).then(file_info => {
                img_load(file_info.url);
            });
        }
    }, [workspace]);

    const down_ref = useRef(null);
    const on_file_change = async (file: File) => {
        const result = await services.api.file.create({
            workspace: editor.workspace,
            file: file,
        });
        img_load(result.url);
        block.setProperty('image', {
            value: result.id,
            name: file.name,
            size: file.size,
            type: file.type,
        });
    };
    const delete_file = () => {
        block.remove();
    };
    const sava_link = (link: string) => {
        img_load(link);
        block.setProperty('image', {
            value: '',
            url: link,
            name: link,
            size: 0,
            type: 'link',
        });
    };
    const handle_click = (e: React.MouseEvent<HTMLDivElement>) => {
        //TODO clear active selection
        // document.getElementsByTagName('body')[0].click();
        e.stopPropagation();
        e.nativeEvent.stopPropagation();
        editor.selectionManager.setSelectedNodesIds([block.id]);
        editor.selectionManager.activeNodeByNodeId(block.id);
    };
    const down_file = () => {
        if (down_ref) {
            down_ref.current.click();
        }
    };

    return (
        <WrapperWithPendantAndDragDrop editor={editor} block={block}>
            <ImageBlock>
                <div ref={resize_box}>
                    {imgUrl ? (
                        <div
                            onClick={handle_click}
                            onMouseDown={e => {
                                // e.nativeEvent.stopPropagation();
                                e.stopPropagation();
                            }}
                        >
                            {scene === SCENE_CONFIG.PAGE ? (
                                <SourceView
                                    block={block}
                                    viewStyle={{
                                        width: imgWidth,
                                        maxWidth:
                                            resize_box.current.offsetWidth - 20,
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
                            fileChange={on_file_change}
                            deleteFile={delete_file}
                            savaLink={sava_link}
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
                        onClick={delete_file}
                        className="delete-icon"
                        fontSize="small"
                        sx={{ color: '#000', cursor: 'pointer' }}
                    ></DeleteSweepOutlinedIcon>
                    <a
                        href={imgUrl}
                        ref={down_ref}
                        style={{ display: 'none' }}
                        download="text.png"
                    ></a>
                </div> */}
                </div>
            </ImageBlock>
        </WrapperWithPendantAndDragDrop>
    );
};
