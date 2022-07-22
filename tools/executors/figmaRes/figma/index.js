const path = require('path');
const fs = require('fs-extra');
const { pascalCase, paramCase } = require('change-case');
const initializeApi = require('./api');
const svgo = require('./svgo');
const util = require('./util');
const generateReactIcon = require('./generateReactIcon');

function getRemoveAttrs(name) {
    if (util.isBrands(name)) {
        return {
            name: 'removeAttrs',
            params: {
                attrs: '',
            },
        };
    }
    return {
        name: 'removeAttrs',
        params: {
            attrs: util.isDuotone(name) ? 'stroke' : '(stroke|fill)',
        },
    };
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

function filterIcons(icons, iconsUrl) {
    const icon_name_set = new Set();
    const icons_filtered = icons.filter(i => {
        if (icon_name_set.has(paramCase(i.name))) {
            console.warn(
                `\nWarn: There is an icon with the same name: ${i.name}`
            );
            return false;
        }
        icon_name_set.add(paramCase(i.name));
        return iconsUrl[i.id];
    });
    return icons_filtered;
}

async function downloadFigmaIcons(props) {
    const { token, fileId, nodeId, folder, patchStyles } = props;
    await fs.ensureDir(folder);
    await fs.emptyDir(folder);
    const api = await initializeApi(token);
    let icons = await api.getChildren(fileId, nodeId);
    const iconsUrl = await api.getIconsUrl(
        fileId,
        icons.map(i => i.id).join(',')
    );
    icons = filterIcons(icons, iconsUrl);
    const generateIcons = icons.map(async icon => {
        const iconUrl = iconsUrl[icon.id];
        const iconName = paramCase(icon.name);
        let originSvg;
        try {
            originSvg = await api.downloadIcon(iconUrl);
        } catch (err) {
            console.error(err);
        }
        let optimizedSvg;
        try {
            const data = await svgo.optimize(
                originSvg,
                getRemoveAttrs(iconName)
            );
            optimizedSvg = data.data;
        } catch (err) {
            console.error(err);
            console.log(iconName);
        }

        const iconFolder = path.resolve(folder, iconName);
        const JSXContent = await generateReactIcon(
            pascalCase(icon.name),
            optimizedSvg,
            patchStyles?.[iconName]
        );
        await Promise.all([
            fs.outputFile(
                path.resolve(iconFolder, `${iconName || icon.name}.svg`),
                optimizedSvg,
                { encoding: 'utf8' }
            ),
            fs.outputFile(
                path.resolve(iconFolder, `${iconName || icon.name}.tsx`),
                JSXContent,
                { encoding: 'utf8', flag: '' }
            ),
        ]);
    });
    await Promise.allSettled([
        ...generateIcons,
        generateImportEntry(icons, folder),
    ]);
}

module.exports = downloadFigmaIcons;
