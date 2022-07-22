/* eslint-disable */
export default {
    displayName: 'datasource-jwt-rpc',
    preset: '../../../jest.preset.js',
    transform: {
        '^.+\\.[tj]sx?$': 'babel-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    coverageDirectory: '../../../coverage/libs/datasource/jwt-rpc',
};
