/* eslint-disable no-restricted-imports */
import OptionUnstyled, {
    optionUnstyledClasses,
} from '@mui/base/OptionUnstyled';

import { styled } from '../styled';

/**
 *  Option is extend by mui OptionUnstyled
 *
 * OptionUnstyled API:
 *
 * - [SelectUnstyled API](https://mui.com/zh/base/api/option-unstyled/)
 *
 * **/

export const Option = styled(OptionUnstyled)(({ theme }) => ({
    height: '32px',
    listStyle: 'none',
    padding: '0 12px',
    borderRadius: '5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    '&:last-of-type': {
        borderBottom: 'none',
    },

    [`&.${optionUnstyledClasses.selected}`]: {
        backgroundColor: '#F5F7F8',
    },

    [`&.${optionUnstyledClasses.highlighted}`]: {
        backgroundColor: '#F5F7F8',
    },

    [`&.${optionUnstyledClasses.highlighted}.${optionUnstyledClasses.selected}`]:
        {},

    [`&.${optionUnstyledClasses.disabled}`]: {},

    [`&:hover:not(.${optionUnstyledClasses.disabled})`]: {
        backgroundColor: '#F5F7F8',
    },
}));
