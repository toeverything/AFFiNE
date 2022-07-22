# Tutorial

Affine defines a new component development specification in Figma, extends Affine UI Components based on MUI BASE and MUI SYSTEM, and supplements as needed https://github.com/toeverything/AFFiNE/tree/master/libs/components/ui , eg `src/libs/components/ui/src/button/base-button.ts`

```jsx
import ButtonUnstyled, {
    buttonUnstyledClasses,
} from '@mui/base/ButtonUnstyled';
import { styled } from '../styled';

/* eslint-disable @typescript-eslint/naming-convention */
const blue = {
    500: '#007FFF',
    600: '#0072E5',
    700: '#0059B2',
};
/* eslint-enable @typescript-eslint/naming-convention */

export const BaseButton = styled(ButtonUnstyled)`
    font-family: IBM Plex Sans, sans-serif;
    font-weight: bold;
    font-size: 0.875rem;
    background-color: ${blue[500]};
    border-radius: 8px;
    padding: 4px 8px;
    color: white;
    transition: all 150ms ease;
    cursor: pointer;
    border: none;

    &:hover {
        background-color: ${blue[600]};
    }

    &.${buttonUnstyledClasses.active} {
        background-color: ${blue[700]};
    }

    &.${buttonUnstyledClasses.focusVisible} {
        box-shadow: 0 4px 20px 0 rgba(61, 71, 82, 0.1), 0 0 0 5px rgba(0, 127, 255, 0.5);
        outline: none;
    }

    &.${buttonUnstyledClasses.disabled} {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;
```

```jsx
export { BaseButton } from './base-button';
```
