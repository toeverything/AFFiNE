const {
    detectPackageManager,
} = require('@nrwl/tao/src/shared/package-manager');
const { spawn } = require('child_process');

exports['default'] = async function tscExecutor(_, context) {
    const libRoot = context.workspace.projects[context.projectName].root;

    const executionCode = await new Promise(resolve => {
        const child = spawn('pnpm', ['exec', 'tsc', '-b', libRoot], {
            stdio: 'inherit',
        });
        child.on('data', args => console.log(args));
        child.on('close', code => resolve(code));
    });

    return { success: executionCode === 0 };
};
