import fs from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import JSZip from 'jszip';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const ZIP_PATH = join(__dirname, './edgeless-snapshot');
const ASSETS_PREFIX = `/static/templates`;
const ASSETS_PATH = join(__dirname, '../core/public/', ASSETS_PREFIX);
const TEMPLATE_PATH = join(__dirname, './edgeless');

const zipFiles = promisify(fs.readdir)(ZIP_PATH).then(files => {
  return files.filter(file => path.extname(file) === '.zip');
});

const setupFolder = async () => {
  if (!fs.existsSync(ASSETS_PATH)) {
    fs.mkdirSync(ASSETS_PATH);
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    fs.mkdirSync(TEMPLATE_PATH);
  }
};

/**
 * @typedef Block
 * @type {object}
 * @property {string} flavour
 * @property {Array<Block> | undefined} children
 * @property {object} props
 * @property {string} props.sourceId
 */

/**
 * @param {Block} block
 */
const convertSourceId = block => {
  if (block.props?.sourceId) {
    block.props.sourceId = `${ASSETS_PREFIX}/${block.props.sourceId}.png`;
  }

  if (block.children && Array.isArray(block.children)) {
    block.children.forEach(convertSourceId);
  }
};

const parseSnapshot = async () => {
  const files = await zipFiles;
  await setupFolder();
  const templates = [];

  for (let file of files) {
    const filePath = path.join(ZIP_PATH, file);
    const templateName = path.basename(file, '.zip');
    const zip = new JSZip();
    const { files: unarchivedFiles } = await zip.loadAsync(
      fs.readFileSync(filePath)
    );
    /**
     * @type {Array<JSZip.JSZipObject>}
     */
    const assetsFiles = [];
    /**
     * @type {Array<JSZip.JSZipObject>}
     */
    const snapshotFiles = [];

    Object.entries(unarchivedFiles).forEach(([name, fileObj]) => {
      if (name.includes('MACOSX') || name.includes('__MACOSX')) return;

      if (name.startsWith('assets/') && !fileObj.dir) {
        assetsFiles.push(fileObj);
        return;
      }

      if (name.endsWith('.snapshot.json')) {
        snapshotFiles.push(fileObj);
        return;
      }
    });

    await Promise.all(
      assetsFiles.map(async file => {
        const blob = await file.async('blob');
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer, 'binary');

        await promisify(fs.writeFile)(
          join(ASSETS_PATH, file.name.replace('assets/', '')),
          buffer
        );
      })
    );

    await Promise.all(
      snapshotFiles.map(async snapshot => {
        const json = await snapshot.async('text');
        const snapshotContent = JSON.parse(json);
        let previewContent = '';

        if (fs.existsSync(join(ZIP_PATH, `${templateName}.svg`))) {
          const previewFile = fs.readFileSync(
            join(ZIP_PATH, `${templateName}.svg`),
            'utf-8'
          );
          previewContent = previewFile
            .replace(/\n/g, '')
            .replace(/\s+/g, ' ')
            .replace('fill="white"', 'fill="currentColor"');
        } else {
          console.warn(`No preview found for ${templateName}`);
        }

        convertSourceId(snapshotContent.blocks);

        const template = {
          name: templateName,
          type: 'template',
          preview: previewContent,
          content: snapshotContent,
        };

        await promisify(fs.writeFile)(
          join(join(TEMPLATE_PATH, `${templateName}.json`)),
          JSON.stringify(template, undefined, 2)
        );

        templates.push(templateName);
      })
    );
  }

  return templates;
};

function numberToWords(n) {
  const ones = [
    'Zero',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
  ];

  if (n < 10) {
    return ones[n];
  } else {
    throw new Error(`Not implemented: ${n}`);
  }
}

const camelCaseNumber = variable => {
  const words = variable.split(' ');
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

const toVariableName = name => {
  const converted = Array.from(name).reduce((pre, char) => {
    if (char >= '0' && char <= '9') {
      return pre + numberToWords(char - '0');
    }

    return pre + char;
  }, '');

  return camelCaseNumber(converted);
};

/**
 *
 * @param {Array<string>} templates
 */
const buildScript = async templates => {
  const templateVariableMap = templates.reduce((map, template) => {
    map[template] = toVariableName(template);
    return map;
  }, {});
  const importStatements = templates
    .map(template => {
      return `import ${toVariableName(
        template
      )} from './edgeless/${template}.json';`;
    })
    .join('\n');

  const code = `
${importStatements}

const templates = {
  'Marketing': [
    ${templateVariableMap['Storyboard']},
    ${templateVariableMap['4P Marketing Matrix']},
    ${templateVariableMap['User Journey Map']}
  ],
  'Project management': [
    ${templateVariableMap['Gantt Chart']},
    ${templateVariableMap['Project Tracking Kanban']},
    ${templateVariableMap['Fishbone Diagram']},
    ${templateVariableMap['Project Planning']},
    ${templateVariableMap['Monthly Calendar']}
  ],
  'Brainstorming': [
    ${templateVariableMap['SWOT']},
    ${templateVariableMap['5W2H']},
    ${templateVariableMap['Flowchart']},
    ${templateVariableMap['Concept Map']},
    ${templateVariableMap['SMART']},
  ],
  'Presentation': [
    ${templateVariableMap['Data Analysis']},
    ${templateVariableMap['Simple Presentation']},
    ${templateVariableMap['Business Proposal']}
  ]
}

function lcs(text1: string, text2: string) {
  const dp: number[][] = Array.from({ length: text1.length + 1 })
    .fill(null)
    .map(() => Array.from<number>({length: text2.length + 1}).fill(0));

  for (let i = 1; i <= text1.length; i++) {
    for (let j = 1; j <= text2.length; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp[text1.length][text2.length];
}

export const builtInTemplates = {
  list: async (category: string) => {
    // @ts-expect-error type should be asserted when using
    return templates[category] ?? []
  },

  categories: async () => {
    return Object.keys(templates)
  },

  search: async(query: string) => {
    const candidates: unknown[] = [];
    const cates = Object.keys(templates);

    query = query.toLowerCase();

    for(let cate of cates) {
      // @ts-expect-error type should be asserted when using
      const templatesOfCate = templates[cate];

      for(let temp of templatesOfCate) {
        if(lcs(query, temp.name.toLowerCase()) === query.length) {
          candidates.push(temp);
        }
      }
    }

    return candidates;
  },
}
`;

  await promisify(fs.writeFile)(
    join(__dirname, './edgeless-templates.gen.ts'),
    code,
    {
      encoding: 'utf-8',
    }
  );
};

async function main() {
  const templates = await parseSnapshot();
  await buildScript(templates);
}

main();
