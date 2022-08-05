import type { IOption } from 'ffc-js-client-side-sdk/esm/types';

export const config: IOption = {
    secret: process.env['AFFINE_FEATURE_FLAG_TOKEN'] || '',
    anonymous: true,
    // user: {
    //   userName: 'the user's user name',
    //   id: 'the user's unique identifier'
    // }
    devModePassword: '-',
    enableDataSync: !!process.env['AFFINE_FEATURE_FLAG_TOKEN'],
    // bootstrap: [
    //     {
    //         // the feature flag key
    //         id: 'flag',
    //         // the feature flag value
    //         variation: false,
    //         // the variation data type, string is used if not provided
    //         variationType: VariationDataType.boolean,
    //         variationOptions: [],
    //         timestamp: 0,
    //         sendToExperiment: false,
    //     },
    // ],
};
