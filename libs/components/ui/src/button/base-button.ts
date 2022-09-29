import ButtonUnstyled, {
    buttonUnstyledClasses,
} from '@mui/base/ButtonUnstyled';
import { styled } from '../styled';

export const BaseButton = styled(ButtonUnstyled)`
    font-size: 0.875rem;
    border-radius: 8px;
    padding: 4px 8px;
    transition: all 150ms ease;
    cursor: pointer;
    border: none;

    &:hover {
    }

    &.${buttonUnstyledClasses.active} {
    }

    &.${buttonUnstyledClasses.focusVisible} {
        box-shadow: 0 4px 20px 0 rgba(61, 71, 82, 0.1),
            0 0 0 5px rgba(0, 127, 255, 0.5);
        outline: none;
    }

    &.${buttonUnstyledClasses.disabled} {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;
