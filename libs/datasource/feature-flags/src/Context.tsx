import ffcClient, { Ffc } from 'ffc-js-client-side-sdk';
import type {
    IFeatureFlagSet,
    IOption,
} from 'ffc-js-client-side-sdk/esm/types';
import { createContext, ReactNode, useEffect, useState } from 'react';
import { config } from './config';

/**
 * Init `ffcClient`
 * Ported from https://github.com/feature-flags-co/ffc-js-client-side-sdk-react-jotai-demo/blob/main/src/ffc/hooks.ts
 * @private
 */
export const useInitFfcEffect = (featureFlagClient: Ffc, option: IOption) => {
    const [flags, setFlags] = useState<Record<string, IFeatureFlagSet>>({});

    useEffect(() => {
        featureFlagClient.init(option);

        featureFlagClient.on('ff_update', (changes: unknown[]) => {
            if (changes.length) {
                setFlags(featureFlagClient.getAllFeatureFlags());
            }
        });

        featureFlagClient.waitUntilReady().then((data: unknown[]) => {
            if (data.length) {
                setFlags(featureFlagClient.getAllFeatureFlags());
            }
        });
        return () => {
            // FIX destroy ffcClient
            // ffcClient.logout();
        };
    }, [featureFlagClient, option, setFlags]);
    return flags;
};

export const FeatureFlagsContext = createContext<{
    ffcClient: Ffc;
    flags: IFeatureFlagSet;
    // TODO use genErrorObj
}>({} as any);

/**
 * @example
 * ```ts
 * const App = () => (
 *   <FeatureFlagsProvider>
 *       <Page />
 *   </FeatureFlagsProvider>
 * );
 * ```
 */
export const FeatureFlagsProvider = ({ children }: { children: ReactNode }) => {
    const flags = useInitFfcEffect(ffcClient, config);

    return (
        <FeatureFlagsContext.Provider value={{ ffcClient, flags }}>
            {children}
        </FeatureFlagsContext.Provider>
    );
};
