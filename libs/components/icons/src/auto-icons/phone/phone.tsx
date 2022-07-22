
import { FC } from 'react';
// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface PhoneIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const PhoneIcon: FC<PhoneIconProps> = ({ color, style, ...props}) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="M16.923 19.4h.005c.11 0 .219-.02.322-.064a.866.866 0 0 0 .283-.193l.003-.003 1.569-1.588-2.94-1.942-1.941 1.576-.892-.387a11.625 11.625 0 0 1-3.655-2.514 11.693 11.693 0 0 1-2.505-3.624l-.397-.899L8.36 7.825l-1.912-2.89-1.58 1.555-.007.007a.848.848 0 0 0-.222.363.893.893 0 0 0-.022.435 15.938 15.938 0 0 0 4.25 7.85 15.94 15.94 0 0 0 7.862 4.231l.01.002.01.002a.81.81 0 0 0 .174.02Zm-9.184-3.12a17.538 17.538 0 0 1-4.688-8.657 2.493 2.493 0 0 1 .06-1.235c.123-.399.344-.76.643-1.046l2.084-2.05a1.038 1.038 0 0 1 .802-.288 1.026 1.026 0 0 1 .755.463L10 7.404a.867.867 0 0 1-.057 1.012l-1.308 1.599a10.094 10.094 0 0 0 2.173 3.138 10.024 10.024 0 0 0 3.162 2.178l1.62-1.315a.843.843 0 0 1 .969-.064l3.933 2.6c.135.082.25.195.337.329a1.081 1.081 0 0 1-.123 1.327l-2.032 2.057c-.23.235-.505.42-.806.547a2.424 2.424 0 0 1-1.47.13 17.541 17.541 0 0 1-8.659-4.662Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
