/**
 * There are many places that rely on Mui in the current project, which are gathered in this file
 */

/* eslint-disable no-restricted-imports */

import {
    Box,
    Collapse,
    IconButton,
    CircularProgress,
    Divider,
    Typography,
    Menu,
    MenuItem,
    Avatar,
    Popover,
    TextField,
    Modal,
    Button,
    List,
    ListItem,
    ListItemText,
    Tooltip,
    tooltipClasses,
    Tabs,
    Tab,
    OutlinedInput,
    InputAdornment,
    Grow,
    Paper,
    MenuList,
    ClickAwayListener,
    Popper,
    Select,
    Switch,
    Grid,
    Container,
    Snackbar,
    InputBase,
    FormControlLabel,
    Checkbox,
    Input,
    Radio,
    Zoom,
} from '@mui/material';

import type {
    PopoverProps,
    PopperPlacementType,
    SelectChangeEvent,
    TooltipProps,
    DividerProps,
} from '@mui/material';
import { ListItemButton } from '@mui/material';

export { alpha } from '@mui/system';

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export type MuiPopoverProps = PopoverProps;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export type MuiPopperPlacementType = PopperPlacementType;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export type MuiSelectChangeEvent<T = string> = SelectChangeEvent<T>;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export type MuiTooltipProps = TooltipProps;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export type MuiDividerProps = DividerProps;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiBox = Box;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiCollapse = Collapse;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiIconButton = IconButton;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiCircularProgress = CircularProgress;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiDivider = Divider;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiTypography = Typography;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiMenu = Menu;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiMenuItem = MenuItem;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiAvatar = Avatar;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiPopover = Popover;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiTextField = TextField;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiModal = Modal;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiButton = Button;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiList = List;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiListItem = ListItem;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiListItemText = ListItemText;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiListItemButton = ListItemButton;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiTooltip = Tooltip;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiTabs = Tabs;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiTab = Tab;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiOutlinedInput = OutlinedInput;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiInputAdornment = InputAdornment;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiGrow = Grow;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiPaper = Paper;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiMenuList = MenuList;

export const MuiClickAwayListener = ClickAwayListener;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiPopper = Popper;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiSelect = Select;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiSwitch = Switch;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiGrid = Grid;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiContainer = Container;
/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const muiTooltipClasses = tooltipClasses;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiSnackbar = Snackbar;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiInputBase = InputBase;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiFormControlLabel = FormControlLabel;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiCheckbox = Checkbox;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiInput = Input;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiZoom = Zoom;

/**
 * @deprecated It is not recommended to use Mui directly, because the design will not refer to Mui's interaction logic.
 */
export const MuiRadio = Radio;
