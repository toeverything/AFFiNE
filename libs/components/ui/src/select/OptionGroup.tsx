import { forwardRef, type ForwardedRef } from 'react';
/* eslint-disable no-restricted-imports */
import OptionGroupUnstyled, {
    OptionGroupUnstyledProps,
} from '@mui/base/OptionGroupUnstyled';
import { styled } from '../styled';

const StyledGroupRoot = styled('li')`
    list-style: none;
`;

const StyledGroupHeader = styled('span')`
    display: block;
    padding: 15px 0 5px 10px;
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    color: #6f7e8c;
`;

const StyledGroupOptions = styled('ul')`
    list-style: none;
    margin-left: 0;
    padding: 0;

    > li {
        padding-left: 20px;
    }
`;

/**
 * TODO: The designer has not yet given a style for OptionGroup, the sample style is used here
 * **/
export const OptionGroup = forwardRef(function CustomOptionGroup(
    props: OptionGroupUnstyledProps,
    ref: ForwardedRef<HTMLLIElement>
) {
    const components: OptionGroupUnstyledProps['components'] = {
        Root: StyledGroupRoot,
        Label: StyledGroupHeader,
        List: StyledGroupOptions,
        ...props.components,
    };

    return <OptionGroupUnstyled {...props} ref={ref} components={components} />;
});
