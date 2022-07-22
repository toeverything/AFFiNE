module.exports = {
    displayName: 'ligo-virgo',
    preset: '../../jest.preset.js',
    transform: {
        'node_modules\\/.+\\.js$': 'jest-esm-transformer',
        '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nrwl/react/plugins/jest',
        '^.+\\.[tj]sx?$': 'babel-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    coverageDirectory: '../../coverage/apps/ligo-virgo',
    transformIgnorePatterns: [],
};
