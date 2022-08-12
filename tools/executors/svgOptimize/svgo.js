const path = require('path');
const svgo = require('svgo');
const { readdir, readFile, writeFile, exists } = require('fs/promises');
const { pascalCase, paramCase } = require('change-case');
const svgr = require('@svgr/core');

async function optimizeSvg(folder) {
    try {
        const icons = await readdir(folder);
        const generateIcons = icons
            .filter(n => n.endsWith('.svg'))
            .map(async icon => {
                let originSvg;
                try {
                    originSvg = await readFile(path.resolve(folder, icon));
                } catch (err) {
                    console.error(err);
                }
                let optimizedSvg;
                try {
                    const data = optimize(originSvg);
                    optimizedSvg = data.data;
                } catch (err) {
                    console.error(err);
                }

                const JSXContent = await getJSXContent(
                    pascalCase(icon),
                    optimizedSvg
                );

                const iconName = path.basename(icon, '.svg');
                await writeFile(
                    path.resolve(folder, `${iconName}.tsx`),
                    JSXContent,
                    { encoding: 'utf8', flag: '' }
                );

                console.log('Generated:', iconName);
            });

        await Promise.allSettled([
            ...generateIcons,
            generateImportEntry(icons, folder),
        ]);
    } catch (err) {
        console.error(err);
    }
}

function optimize(input) {
    return svgo.optimize(input, {
        plugins: [
            'preset-default',
            'prefixIds',
            {
                name: 'sortAttrs',
                params: {
                    xmlnsOrder: 'alphabetical',
                },
            },
        ],
    });
}

/**
 * get icon component template
 *
 * @param {string} name
 */
async function getJSXContent(name, svgCode) {
    let svgrContent = '';
    try {
        svgrContent = await svgr.transform(
            svgCode,
            {
                icon: true,
                typescript: true,
            },
            { componentName: `${name}Icon1` }
        );
    } catch (err) {
        console.error(err);
    }
    let matcher = svgrContent.match(/<svg ([^\>]+)>([\s\S]*?)<\/svg>/);
    return `
import { SvgIcon, SvgIconProps } from '@mui/material';
export const ${name}Icon = (props: SvgIconProps) => (
    <SvgIcon  ${matcher[1]}>
    ${matcher[2]}
    </SvgIcon>
);
`;
}

async function generateImportEntry(iconNodes, folder) {
    const fileWithImportsPath = path.resolve(folder, 'index.ts');

    const importsContent = iconNodes
        .map(iconNode => {
            const iconName = paramCase(iconNode.name);
            if (!iconName) {
                return `// Error: ${iconNode.name}`;
            }

            return `export * from './${iconName}/${iconName}';`;
        })
        .join('\n');

    await fs.writeFile(
        fileWithImportsPath,
        `export const timestamp = ${Date.now()};\n${importsContent}`,
        { encoding: 'utf8' }
    );
}

/**
 * @param {*} options
 * @param {array} options.assets
 * @param {string} options.assets.folder
 * @param {*} context
 * @returns
 */
exports['default'] = async function svgo(options, context) {
    const libRoot = context.workspace.projects[context.projectName].root;
    await Promise.allSettled(
        (options.assets || []).map(async (asset, index) => {
            await optimizeSvg(path.resolve(libRoot, asset.folder));
        })
    );

    return { success: true };
};
