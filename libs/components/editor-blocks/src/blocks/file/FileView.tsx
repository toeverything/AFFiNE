import { FC, useState, useEffect, useRef } from 'react';
import { CreateView } from '@toeverything/framework/virgo';
import { Upload } from '../../components/upload/upload';
import { services, FileColumnValue } from '@toeverything/datasource/db-service';
import { styled } from '@toeverything/components/ui';
import { useOnSelect } from '@toeverything/components/editor-core';
type FileView = CreateView;
const MESSAGES = {
    ADD_AN_FILE: 'Add an file',
};

const FileViewContainer = styled('div')<{ isSelected: boolean }>(
    ({ theme, isSelected }) => {
        return {
            borderRadius: theme.affine.shape.xsBorderRadius,
            border: `1px solid ${
                isSelected ? theme.affine.palette.primary : '#e0e0e0'
            }`,
            width: '100%',
            background: '#f7f7f7',
            padding: '15px 10px',
            display: 'flex',
            marginTop: '10px',
            marginBottom: '10px',
            '.file-name': {
                fontWeight: 600,
                maxWidth: '100px',
                display: 'inline-block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                cursor: 'pointer',
            },
            '.file-size': {
                color: '#666',
                paddingLeft: '10px',
            },
            '.delete': {
                display: 'none',
                float: 'right',
            },
            '&:hover': {
                background: '#eee',
                '.delete': {
                    display: 'inline-block',
                },
            },
        };
    }
);
export const FileView: FC<FileView> = ({ block, editor }) => {
    const [fileUrl, setFileUrl] = useState<string>();
    const fileInfo = block.getProperty('file') || ({} as FileColumnValue);
    const file_id = fileInfo.value;

    useEffect(() => {
        if (file_id) {
            services.api.file.get(file_id, editor.workspace).then(fileInfo => {
                setFileUrl(fileInfo.url);
            });
        }
    }, [editor.workspace, file_id]);
    const [isSelect, setIsSelect] = useState<boolean>();
    useOnSelect(block.id, (is_select: boolean) => {
        setIsSelect(is_select);
    });
    const down_ref = useRef(null);
    const onFileChange = async (file: File) => {
        const result = await services.api.file.create({
            workspace: editor.workspace,
            file: file,
        });
        setFileUrl(result.url);
        block.setProperty('file', {
            value: result.id,
            name: file.name,
            size: file.size,
            type: file.type,
        });
    };
    const deleteFile = () => {
        block.remove();
    };
    const downFile = () => {
        if (down_ref) {
            down_ref.current.click();
        }
    };

    return (
        <div>
            {fileUrl ? (
                // <div>
                //     <DownloadIcon onClick={down_file} className="delete-icon" fontSize="small" sx={{ color: '#fff', cursor: 'pointer', marginRight: '10px' }}></DownloadIcon>
                //     <DeleteSweepOutlinedIcon onClick={delete_file} className="delete-icon" fontSize="small" sx={{ color: '#fff', cursor: 'pointer' }}></DeleteSweepOutlinedIcon>
                //     <a href={file_url} ref={down_ref} style={{ display: 'none' }} download="text.png">
                //         &nbsp;
                //     </a>
                // </div>
                <FileViewContainer isSelected={isSelect}>
                    <span onClick={downFile} className="file-name">
                        {fileInfo.name}
                    </span>
                    <span className="file-size"> {fileInfo.size}kb</span>
                    <a
                        href={fileUrl}
                        ref={down_ref}
                        style={{ display: 'none' }}
                        download={fileInfo.name}
                    />
                </FileViewContainer>
            ) : (
                <Upload
                    uploadType={'file'}
                    firstCreate={block.firstCreateFlag}
                    fileChange={onFileChange}
                    deleteFile={deleteFile}
                    defaultAddBtnText={MESSAGES.ADD_AN_FILE}
                    isSelected={isSelect}
                />
            )}
        </div>
    );
};
