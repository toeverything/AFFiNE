const nrwlConfig = require('@nrwl/react/plugins/bundle-rollup');
const style9 = require('style9/rollup');

module.exports = config => {
    const nxConfig = nrwlConfig(config);
    const padding = [];

    const postcssIndex = nxConfig.plugins.findIndex(p => p?.name === 'postcss');
    if (postcssIndex !== -1) {
        const postcss = nxConfig.plugins[postcssIndex];

        padding.push(postcss);
        nxConfig.plugins.splice(postcssIndex, 1);

        const style9Plugin = style9({
            minifyProperties: true,
            incrementalClassnames: true,
        });
        padding.push(style9Plugin);

        const rpt2Index = nxConfig.plugins.findIndex(p => p?.name === 'rpt2');
        if (rpt2Index !== -1) {
            // padding.push(nxConfig.plugins[rpt2Index]);
            nxConfig.plugins.splice(rpt2Index, 1);
        }
    }

    return {
        ...nxConfig,
        plugins: [...padding, ...nxConfig.plugins].filter(v => v),
    };
};
