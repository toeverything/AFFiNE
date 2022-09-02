module.exports = {
    input: [
        '**/src/**/*.{ts,tsx}',
        '**/src/*.{ts,tsx}',
        // Use ! to filter out files or directories
        '!app/**/*.spec.{ts,tsx}',
        '!**/i18n/**',
        '!**/node_modules/**',
    ],
    output: './',
    options: {
        debug: true,
        func: {
            list: ['i18next.t', 'i18n.t', 't'],
            extensions: ['.ts', '.tsx'],
        },
        lngs: ['en', 'zh'],
        ns: ['en', 'zh'],
        defaultLng: 'en',
        defaultNs: 'en',
        defaultValue: '__STRING_NOT_TRANSLATED__',
        resource: {
            loadPath: 'src/i18n/resources/{{ns}}.json',
            savePath: 'src/i18n/resources/{{ns}}.json',
            jsonIndent: 4,
            lineEnding: '\n',
        },
        nsSeparator: false, // namespace separator
        keySeparator: false, // key separator
        interpolation: {
            prefix: '{{',
            suffix: '}}',
        },
    },
};
