import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import {
    MuiBox as Box,
    MuiButton as Button,
    MuiClickAwayListener as ClickAwayListener,
    MuiPopper,
    MuiTab as Tab,
    MuiTabs as Tabs,
    MuiTextField as TextField,
    styled,
    SxProps,
} from '@toeverything/components/ui';
import {
    ChangeEvent,
    ReactElement,
    SyntheticEvent,
    useRef,
    useState,
    type MouseEvent,
} from 'react';

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
    // maxWidth:'100%',
    // The z-index of refPage is 200,
    // so the z-index of upload need to be greater than it
    zIndex: 201,
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
    const type = ['file', 'image'].includes(uploadType) ? 'file' : 'link';
    const [value, setValue] = useState(type);

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleChange = (event: SyntheticEvent, newValue: string) => {
        setValue(newValue);
    };

    const handleClick = (event: MouseEvent<HTMLElement>) => {
        setAnchorEl(anchorEl ? null : event.currentTarget);
    };

    const handleClickAway = () => {
        setAnchorEl(null);
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
        <Box sx={{ position: 'relative' }}>
            <UploadBox onClick={handleClick} isSelected={isSelected}>
                {defaultAddBtnText ? defaultAddBtnText : MESSAGES.ADD_AN_FILE}
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
                    <MuiPopper
                        open={open}
                        anchorEl={anchorEl}
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
                    </MuiPopper>
                </ClickAwayListener>
            )}
        </Box>
    );
};
