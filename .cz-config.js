module.exports = {
    types: [
        { value: 'feat', name: 'feat 🍄: add new features' },
        { value: 'fix', name: 'fix 🐛: fix bug' },
        { value: 'docs', name: 'docs 📄: modify documentation, comments' },
        {
            value: 'refactor',
            name: 'refactor 🎸: code refactoring, pay attention to distinguish it from features and fixes',
        },
        { value: 'perf', name: 'perf ⚡: improve performance' },
        { value: 'test', name: 'test 👀: add a test' },
        {
            value: 'tool',
            name: 'tool 🚗: Development tool changes (build, scaffolding tools, etc.)',
        },
        {
            value: 'style',
            name: 'style ✂: Modifications to code formatting do not affect logic',
        },
        { value: 'revert', name: 'revert 🌝: version rollback' },
        {
            value: 'editor',
            name: 'editor 🔧: editor configuration modification',
        },
        { value: 'update', name: 'update ⬆: third-party library upgrade' },
    ],
    scopes: [
        { name: 'selection' },
        { name: 'edgeless' },
        { name: 'point' },
        { name: 'group' },
        { name: 'page' },
        { name: 'component' },
        { name: 'config' },
        { name: 'others' },
    ],

    // it needs to match the value for field type. Eg.: 'fix'
    /*
scopeOverrides: {
  fix: [
    {name: 'merge'},
    {name: 'style'}
  ]

},
*/
    // override the messages, de faults are as follows
    messages: {
        type: 'Choose a type of your submission:',
        scope: 'Choose a scope (optional):',
        // used if allowCustomScopes is true
        customScope: 'Denote the SCOPE of this change:',
        subject: 'Brief description:\n',
        body: 'Detailed description, use "|" newline (optional):\n',
        breaking: 'Incompatibility specification (optional):\n',
        footer: 'Associate closed issues, for example: #31, #34 (optional):\n',
        confirmCommit: 'Are you sure to commit?',
    },

    allowCustomScopes: true,
    allowBreakingChanges: ['Added', 'Repair'],

    // limit subject length
    subjectLimit: 100,
};
