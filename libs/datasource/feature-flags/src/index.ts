// Feature Flags
// Website https://featureflag.co/
// SDK doc https://github.com/feature-flags-co/ffc-js-client-side-sdk
// Demo https://github.com/feature-flags-co/ffc-js-client-side-sdk-react-jotai-demo

import type { IUser } from 'ffc-js-client-side-sdk/esm/types';
import { useContext } from 'react';
import { FeatureFlagsContext } from './Context';

/**
 * The `ffcClient` should not export to external modules.
 * Do not export this please.
 *
 * @private
 */
const useFfcClient = () => {
    const { ffcClient } = useContext(FeatureFlagsContext);
    return ffcClient;
};

/**
 * NOTICE: The hook can no trigger the `Ffc.sendFeatureFlagInsight`,
 * may lead to inaccurate telemetry data.
 *
 * Use it discreetly.
 */
const useFlags = () => {
    const { flags } = useContext(FeatureFlagsContext);
    return flags;
};

type UseFlagFn = (<T = unknown>(flag: string) => T | undefined) &
    (<T = unknown>(flag: string, defaultValue: T) => T) &
    // Workaround for infers boolean as true or false
    // Remove this after the issue fixed
    // See https://github.com/microsoft/TypeScript/issues/29400
    ((flag: string, defaultValue: false) => boolean) &
    ((flag: string, defaultValue: true) => boolean);

/**
 * Returns the specified flag.
 *
 * The parameter defaultValue should have the same data type with flag type.
 *
 * @public
 * @example
 * ```ts
 * const App = () => {
 *   const flag1 = useFlag('flag1', 'default value');
 *   // ^? string
 *   const flag2 = useFlag<boolean>('flag2');
 *   // ^? boolean | undefined
 *   return <div>flag1: {flag1}</div>
 * }
 * ```
 */
export const useFlag = ((flag: string, defaultValue: unknown) => {
    const flags = useFlags();
    const ffcClient = useFfcClient();
    // @ts-expect-error This is a BUG for ffc-js-client. ffc-js-client supported typed flag now.
    ffcClient.sendFeatureFlagInsight(flag, defaultValue);
    const value: unknown = flags[flag];

    if (defaultValue === undefined) {
        // Can not guess the type, return the flag value directly
        return value;
    }

    if (value === undefined) {
        return defaultValue;
    }

    if (typeof value !== typeof defaultValue) {
        console.error(
            `[Feature Flags] Flag "${flag}" type mismatch! Make ensure you have set the correct type in feature flag portal! flag type: "${typeof value}", defaultValue type: "${typeof defaultValue}"`,
            'flag:',
            value,
            'defaultValue:',
            defaultValue
        );
        return defaultValue;
    }
    return value;
}) as UseFlagFn;

/**
 * Set the user after initialization
 *
 * If the user parameter cannot be passed by the init method,
 * the following method can be used to set the user after initialization.
 *
 * See https://github.com/feature-flags-co/ffc-js-client-side-sdk#set-the-user-after-initialization
 */
export const useIdentifyUser = () => {
    const ffcClient = useFfcClient();
    return (user: IUser) => ffcClient.identify(user);
};

/**
 * Set the user to anonymous user
 *
 * We can manually call the method logout, which will switch the current user back to anonymous user if exists already or create a new anonymous user.
 *
 * See https://github.com/feature-flags-co/ffc-js-client-side-sdk#set-the-user-to-anonymous-user
 */
export const useLogout = () => {
    const ffcClient = useFfcClient();
    return () => ffcClient.logout();
};

export { FeatureFlagsProvider } from './Context';
