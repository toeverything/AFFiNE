

// eslint-disable-next-line no-restricted-imports
import { SvgIcon } from '@mui/material';
// eslint-disable-next-line no-restricted-imports
import type { SvgIconProps } from '@mui/material';

export interface TextFontIconProps extends Omit<SvgIconProps, 'color'> {
    color?: string
}

export const TextFontIcon = (
    {
        color,
        style,
        ...props
    }: TextFontIconProps
) => {
    const propsStyles = {"color": color};
    const customStyles = {};
    const styles = {...propsStyles, ...customStyles, ...style}
    return (
        <SvgIcon style={styles} {...props}>
        <path fillRule="evenodd" d="m21.202 11.977.051.058c.452.549.693 1.308.693 2.278v5.363h-1.13 1.13v-5.363c0-.97-.241-1.729-.693-2.278a2.396 2.396 0 0 0-.051-.058Zm-.385 6.294a3.738 3.738 0 0 1-3.13 1.632c-.783 0-1.4-.21-1.867-.63.467.42 1.084.63 1.866.63a3.737 3.737 0 0 0 3.13-1.632Zm-.597-5.598c-.339-.34-.842-.509-1.51-.509-.572 0-1.039.113-1.4.372-.406.258-.662.662-.782 1.195l-1.19-.097 1.19.097c.12-.533.376-.937.782-1.195.361-.259.828-.372 1.4-.372.668 0 1.171.169 1.51.509Zm.424 1.591v.34l-1.77.03c-1.184.017-2.11.261-2.763.729-.753.505-1.111 1.248-1.111 2.229 0 .704.251 1.297.755 1.753.488.44 1.13.655 1.931.655a3.838 3.838 0 0 0 3.033-1.43v1.204h1.325v-5.461c0-.986-.245-1.769-.715-2.34l-.002-.002c-.566-.659-1.41-.971-2.542-.971-.946 0-1.704.197-2.297.598-.658.437-1.076 1.125-1.245 2.018l-.02.107 1.381.112.019-.082c.116-.514.36-.893.74-1.135l.004-.003c.339-.242.783-.353 1.343-.353.661 0 1.14.17 1.453.493.315.324.48.82.48 1.51Zm-3.965 4.165a1.17 1.17 0 0 1-.347-.87c0-1.21.873-1.825 2.619-1.857l1.79-.032-1.79.032c-1.746.032-2.62.646-2.62 1.858 0 .347.11.629.348.87Zm1.263.358c-.462 0-.83-.124-1.111-.35a1.082 1.082 0 0 1-.401-.877c0-.58.206-1.004.613-1.292.413-.292 1.045-.452 1.91-.468l1.69-.03v.61c0 .614-.27 1.17-.81 1.656-.555.502-1.179.75-1.89.75ZM7.152 4 1.505 20H3.2l1.765-5h6.068l1.765 5h1.697L8.848 4H7.152Zm3.176 9L8 6.404 5.672 13h4.656Z" clipRule="evenodd" />
        </SvgIcon>
    )
};
