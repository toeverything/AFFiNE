import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const data = {};

const __dirname = join(fileURLToPath(import.meta.url), '..');
const categories = Array.from(
  await fs.readdir(join(__dirname, './stickers'))
).filter(v => v !== '.DS_Store');

const naturalSort = array => {
  return array.sort(
    new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
  );
};

let i = 0;

for (const category of categories) {
  const stickers = naturalSort(
    Array.from(
      await fs.readdir(join(__dirname, './stickers', category, 'Cover'))
    ).filter(v => v !== '.DS_Store')
  );

  data[category] = {};

  for (const sticker of stickers) {
    const content = await fs.readFile(
      join(__dirname, './stickers', category, 'Content', sticker),
      null
    );
    const hash = createHash('sha256').update(content).digest('base64');
    const id = (i++).toString().padStart(3, '0');

    const name = basename(sticker, extname(sticker));

    data[category][basename(sticker, extname(sticker))] = {
      importStatement: `import stickerCover${id} from './stickers/${category}/Cover/${sticker}';
import stickerContent${id} from './stickers/${category}/Content/${sticker}';`,
      template: `{
        name: ${JSON.stringify(name)},
        cover: stickerCover${id},
        content: stickerContent${id},
        hash: ${JSON.stringify(hash).replace(/\+/g, '-').replace(/\//g, '_')},
      }`,
    };
  }
}

const importStatements = Object.values(data)
  .map(v => Object.values(v).map(v => v.importStatement))
  .flat()
  .join('\n');

const templates = `const templates = {
  ${Object.entries(data)
    .map(
      ([category, stickers]) =>
        `${JSON.stringify(category)}: [${Object.entries(stickers)
          .map(
            ([_name, data]) => `     buildStickerTemplate(${data.template}),`
          )
          .join('\n')}],`
    )
    .join('\n')}
}`;
function buildStickerTemplate(data) {
  return {
    name: data.name,
    preview: data.cover,
    type: 'sticker',
    assets: {
      [data.hash]: data.content,
    },
    content: {
      type: 'page',
      meta: {
        id: 'doc:home',
        title: 'Sticker',
        createDate: 1701765881935,
        tags: [],
      },
      blocks: {
        type: 'block',
        id: 'block:1VxnfD_8xb',
        flavour: 'affine:page',
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [
              {
                insert: 'Sticker',
              },
            ],
          },
        },
        children: [
          {
            type: 'block',
            id: 'block:pcmYJQ63hX',
            flavour: 'affine:surface',
            props: {
              elements: {},
            },
            children: [
              {
                type: 'block',
                id: 'block:N24al1Qgl7',
                flavour: 'affine:image',
                props: {
                  caption: '',
                  sourceId: data.hash,
                  width: 0,
                  height: 0,
                  index: 'b0D',
                  xywh: '[0,0,460,430]',
                  rotate: 0,
                },
                children: [],
              },
            ],
          },
        ],
      },
    },
  };
}

const code = `
/* eslint-disable */
// @ts-nocheck

${importStatements}

${buildStickerTemplate.toString()}

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

${templates}

export const builtInTemplates = {
  list: async (category: string) => {
    return templates[category] ?? []
  },

  categories: async () => {
    return Object.keys(templates)
  },

  search: async(query: string) => {
    const candidates: unknown[] = [];
    const cates = Object.keys(templates);

    query = query.toLowerCase();

    for(const cate of cates) {
      const templatesOfCate = templates[cate];

      for(const temp of templatesOfCate) {
        if(lcs(query, temp.name.toLowerCase()) === query.length) {
          candidates.push(temp);
        }
      }
    }

    return candidates;
  },
}
`;

await fs.writeFile(join(__dirname, './stickers-templates.gen.ts'), code, {
  encoding: 'utf-8',
});
