// eslint-disable-next-line no-restricted-imports
import { styled as muiStyled } from '@mui/material/styles';
import { ReactHTML, ReactSVG } from 'react';
import isPropValid from '@emotion/is-prop-valid';
export type { SxProps } from '@mui/system';

// Props that will be passed to DOM
const ALLOW_LIST_PROPS: string[] = [];

const isSimpleElement = (
    component: unknown
): component is keyof ReactHTML | keyof ReactSVG => {
    // TODO: improve this
    return typeof component === 'string';
};

// See https://emotion.sh/docs/typescript#forwarding-props
const isValidProp = (prop: string): boolean =>
    isPropValid(prop) || ALLOW_LIST_PROPS.includes(prop);

/**
 * Forward prop except transient prop
 *
 * Support [Transient props](https://styled-components.com/docs/api#transient-props)
 * See https://github.com/styled-components/styled-components/pull/3052
 */
const isNotTransientProp = (prop: string): boolean => !prop.startsWith('$'); // || prop !== 'as';

/**
 * Workaround for the [Unknown Prop Warning](https://reactjs.org/warnings/unknown-prop.html) when passing custom props to styled components
 *
 * > React does not recognize the `xxxxxx` prop on a DOM element.
 * If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `xxxxx` instead.
 * If you accidentally passed it from a parent component,
 * remove it from the DOM element.
 *
 * For a detailed discussion, see https://github.com/emotion-js/emotion/issues/655
 *
 * We simulate the behavior of the [styled-components](https://github.com/styled-components).
 *
 * > If the styled target is a simple element (e.g. styled.div),
 *  styled-components passes through any known HTML attribute to the DOM.
 *  If it is a custom React component (e.g. styled(MyComponent)),
 *  styled-components passes through all props.
 *
 * See https://styled-components.com/docs/basics#passed-props
 */
export const styled: typeof muiStyled = (
    component: Parameters<typeof muiStyled>[0],
    options?: Parameters<typeof muiStyled>[1]
): ReturnType<typeof muiStyled> => {
    // @ts-ignore Fix https://github.com/nrwl/nx/issues/4508
    if (options?.shouldForwardProp) {
        // Explicitly declared, no need handle
        return muiStyled(component, options);
    }
    if (!options) {
        options = {};
    }

    if (!isSimpleElement(component)) {
        // Is custom React component, pass props except transient props through
        // @ts-ignore Fix https://github.com/nrwl/nx/issues/4508
        options.shouldForwardProp = isNotTransientProp;

        return muiStyled(component, options);
    }

    // Is simple element, pass only valid props
    // @ts-ignore Fix https://github.com/nrwl/nx/issues/4508
    options.shouldForwardProp = isValidProp;
    return muiStyled(component, options);
};
