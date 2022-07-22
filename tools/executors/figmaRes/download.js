const path = require('path');
const process = require('process');
const downloadIcons = require('./figma');
const patchStyles = require('./patch-styles');

/**
 * @param {*} options
 * @param {array} options.assets
 * @param {string} options.assets.fileId
 * @param {string} options.assets.nodeId
 * @param {string} options.assets.folder
 * @param {*} context
 * @returns
 */
exports['default'] = async function downloadFigmaRes(options, context) {
    const libRoot = context.workspace.projects[context.projectName].root;
    const token = process.env.FIGMA_TOKEN;
    if (!token) {
        throw new Error(
            'FIGMA_TOKEN is not defined. Please set it in your .env.local file.'
        );
    }
    await Promise.allSettled(
        (options.assets || []).map(async (asset, index) => {
            const fileId = asset.fileId;
            const nodeId = asset.nodeId;
            const folder =
                asset.folder || `./src/icon${index > 0 ? index : ''}`;
            if (!token || !fileId || !nodeId) {
                const message = `Please check if token/fileId/nodeId exists (No.${index}).`;
                console.error(message);
                throw new Error(message);
            }
            await downloadIcons({
                token,
                fileId,
                nodeId,
                folder: path.resolve(libRoot, folder),
                patchStyles,
            });
        })
    );

    return { success: true };
};
