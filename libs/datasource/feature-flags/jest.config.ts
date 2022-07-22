/* eslint-disable */
export default {
    displayName: 'datasource-feature-flags',
    preset: '../../../jest.preset.js',
    transform: {
        '^.+\\.[tj]sx?$': 'babel-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    coverageDirectory: '../../../coverage/libs/datasource/feature-flags',
};
