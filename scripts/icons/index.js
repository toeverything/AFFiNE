const fs = require('fs-extra');
const changeCase = require('change-case');
const initializeAPI = require('./figma-api');
const utils = require('./utils');
const svgo = require('./svgo');

const fileId = process.env.figma_file_id;
const nodeId = process.env.figma_node_id;
const token = process.env.figma_token;
const iconDir = './packages/app/src/icons/auto/';

async function download() {
  const api = await initializeAPI(token);
  const data = await api.getChildren(fileId, nodeId);
  const icons = utils.iconNameFilter(data);
  const svgUrlMap = await api.getSvgUrls(
    fileId,
    icons.map(i => i.id).join(',')
  );
  Promise.all(
    icons.map(async icon => {
      const name = changeCase.pascalCase(icon.name);
      const downloadLink = svgUrlMap[icon.id];
      const svgContent = await api.downloadSvg(downloadLink);
      const optimized = svgo.optimize(svgContent);
      await fs.outputFile(`${iconDir}${name}.svg`, optimized.data);
    })
  );
}

download();
