import {
    useRef,
    ChangeEvent,
    ReactElement,
    useState,
    SyntheticEvent,
} from 'react';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import {
    styled,
    SxProps,
    MuiTextField as TextField,
    MuiButton as Button,
    MuiClickAwayListener as ClickAwayListener,
    MuiTabs as Tabs,
    MuiTab as Tab,
    MuiBox as Box,
} from '@toeverything/components/ui';

const MESSAGES = {
    ADD_AN_FILE: 'Add an file',
    SIZE_EXCEEDS_LIMIT: 'Size exceeds limit',
};
interface Props {
    uploadType?: string;
    title?: string;
    view?: ReactElement;
    size?: number;
    accept?: string;
    isSelected?: boolean;
    defaultAddBtnText?: string;
    firstCreate: boolean | undefined;
    fileChange?: (file: File) => void;
    deleteFile?: () => void;
    savaLink?: (link: string) => void;
}
const styles: SxProps = {
    position: 'absolute',
    width: '600px',
    zIndex: 99,
    marginLeft: '50px',
    p: 1,
    bgcolor: 'background.paper',
    borderRadius: '4px',
    textAlign: 'center',
    boxShadow:
        'rgb(15 15 15 / 5%) 0px 0px 0px 1px, rgb(15 15 15 / 10%) 0px 3px 6px, rgb(15 15 15 / 20%) 0px 9px 24px',
};
const UploadBox = styled('div')<{ isSelected: boolean }>(
    ({ theme, isSelected }) => {
        return {
            width: '100%',
            padding: '15px 10px',
            fontSize: theme.affine.typography.body1.fontSize,
            borderRadius: '4px',
            cursor: 'pointer',
            background: isSelected ? 'rgba(152, 172, 189, 0.2)' : '#fafafa',
            border: '1px solid #e0e0e0',
            '.delete': {
                display: 'none',
                float: 'right',
            },
            '&:hover': {
                '.delete': {
                    display: 'inline-block',
                },
            },
        };
    }
);

const button_styles: SxProps = { width: '60%', fontSize: '12px' };
export const Upload = (props: Props) => {
    const {
        fileChange,
        size,
        accept,
        deleteFile,
        uploadType,
        defaultAddBtnText,
        savaLink,
        firstCreate,
        isSelected,
    } = props;
    const input_ref = useRef<HTMLInputElement>(null);
    const [upload_link, set_upload_link] = useState('');

    const [open, setOpen] = useState<boolean>(firstCreate);
    const type = ['file', 'image'].includes(uploadType) ? 'file' : 'link';
    const [value, setValue] = useState(type);

    const handleChange = (event: SyntheticEvent, newValue: string) => {
        setValue(newValue);
    };

    const handleClick = () => {
        setOpen(prev => !prev);
    };

    const handleClickAway = () => {
        setOpen(false);
    };
    const choose_file = () => {
        if (input_ref.current) {
            input_ref.current.click();
        }
    };
    const handle_input_change = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) {
            return;
        }
        const file = files[0];
        if (size && size < file.size) {
            console.log(MESSAGES.SIZE_EXCEEDS_LIMIT);
        }
        fileChange(file);
        if (input_ref.current) {
            input_ref.current.value = '';
        }
    };
    const on_link_input_change = (e: any) => {
        set_upload_link(e.target.value);
    };
    const handle_sava_link = () => {
        savaLink(upload_link);
    };
    return (
        <div>
            <Box sx={{ position: 'relative' }}>
                <UploadBox onClick={handleClick} isSelected={isSelected}>
                    {defaultAddBtnText
                        ? defaultAddBtnText
                        : MESSAGES.ADD_AN_FILE}
                    <span
                        className="delete"
                        onClick={e => {
                            e.stopPropagation();
                            deleteFile();
                        }}
                    >
                        <DeleteSweepOutlinedIcon
                            className="delete-icon"
                            fontSize="small"
                            sx={{
                                color: 'rgba(0,0,0,.5)',
                                cursor: 'pointer',
                                '&:hover': { color: 'rgba(0,0,0,.9)' },
                            }}
                        />
                    </span>
                </UploadBox>
                {open && (
                    <ClickAwayListener onClickAway={handleClickAway}>
                        <Box
                            onClick={e => {
                                e.stopPropagation();
                            }}
                            sx={styles}
                        >
                            <Tabs
                                sx={{
                                    borderBottom: '1px solid #ccc',
                                    minHeight: '36px',
                                }}
                                value={value}
                                onChange={handleChange}
                            >
                                {['file', 'image'].includes(uploadType) ? (
                                    <Tab
                                        sx={{
                                            fontSize: '12px',
                                            minHeight: '36px',
                                        }}
                                        value="file"
                                        label="Upload"
                                    />
                                ) : (
                                    ''
                                )}
                                {!['file', 'image'].includes(uploadType) ? (
                                    <Tab
                                        sx={{
                                            fontSize: '12px',
                                            minHeight: '36px',
                                        }}
                                        value="link"
                                        label="Embed Link"
                                    />
                                ) : (
                                    ''
                                )}
                            </Tabs>

                            {value === 'file' ? (
                                <Box sx={{ padding: '10px' }}>
                                    <Button
                                        variant="outlined"
                                        sx={button_styles}
                                        onClick={choose_file}
                                        size="small"
                                    >
                                        {defaultAddBtnText
                                            ? defaultAddBtnText
                                            : MESSAGES.ADD_AN_FILE}
                                    </Button>
                                    <input
                                        ref={input_ref}
                                        type="file"
                                        style={{ display: 'none' }}
                                        onChange={handle_input_change}
                                        accept={accept}
                                    />
                                </Box>
                            ) : (
                                <Box>
                                    <Box
                                        sx={{
                                            '.MuiTextField-root': {
                                                width: '100%',
                                            },
                                        }}
                                    >
                                        <TextField
                                            value={upload_link}
                                            hiddenLabel
                                            margin={'dense'}
                                            sx={{
                                                fontSize: '12px',
                                                padding: 0,
                                            }}
                                            onChange={on_link_input_change}
                                            variant="outlined"
                                            size="small"
                                        />
                                    </Box>
                                    <Button
                                        variant="outlined"
                                        sx={button_styles}
                                        onClick={handle_sava_link}
                                        size="small"
                                    >
                                        embed link
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    </ClickAwayListener>
                )}
            </Box>
        </div>
    );
};
