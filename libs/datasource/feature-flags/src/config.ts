import type { IOption } from 'ffc-js-client-side-sdk/esm/types';

export const config: IOption = {
    secret: process.env['AFFINE_FEATURE_FLAG_TOKEN'] || '',
    anonymous: true,
    // user: {
    //   userName: 'the user's user name',
    //   id: 'the user's unique identifier'
    // }
    devModePassword: '-',
};
