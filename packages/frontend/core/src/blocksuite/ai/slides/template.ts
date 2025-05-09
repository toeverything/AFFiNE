import { Bound } from '@blocksuite/affine/global/gfx';
import { nanoid } from '@blocksuite/affine/store';

import { AIProvider } from '../provider';

const replaceText = (text: Record<string, string>, template: any) => {
  if (template != null && typeof template === 'object') {
    if (Array.isArray(template)) {
      template.forEach(v => replaceText(text, v));
      return;
    }
    if (typeof template.insert === 'string') {
      template.insert = text[template.insert] ?? template.insert;
    }
    Object.values(template).forEach(v => replaceText(text, v));
    return;
  }
};

function seededRNG(seed: string) {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  const seededNumber = stringToNumber(seed);
  return ((a * seededNumber + c) % m) / m;

  function stringToNumber(str: string) {
    let res = 0;
    for (let i = 0; i < str.length; i++) {
      const character = str.charCodeAt(i);
      res += character;
    }
    return res;
  }
}

const getImageUrlByKeyword =
  (keyword: string) =>
  async (w: number, h: number): Promise<string> => {
    const photos = await AIProvider.photoEngine?.searchImages({
      query: keyword,
      width: w,
      height: h,
    });

    if (photos == null || photos.length === 0) {
      return ''; // fixme: give a default image
    }

    // use a stable random seed
    const rng = seededRNG(`${w}.${h}.${keyword}`);
    return photos[Math.floor(rng * photos.length)];
  };

const getImages = async (
  images: Record<string, (w: number, h: number) => Promise<string> | string>,

  template: any
): Promise<TemplateImage[]> => {
  const imgs: Record<
    string,
    {
      id: string;
      width: number;
      height: number;
    }
  > = {};

  const run = (data: any) => {
    if (data != null && typeof data === 'object') {
      if (Array.isArray(data)) {
        data.forEach(v => run(v));
        return;
      }
      if (typeof data.caption === 'string') {
        const bound = Bound.deserialize(data.xywh);
        const id = nanoid();
        data.sourceId = id;
        imgs[data.caption] = {
          id: id,
          width: bound.w,
          height: bound.h,
        };
        delete data.caption;
      }
      Object.values(data).forEach(v => run(v));
      return;
    }
  };
  run(template);
  const list = await Promise.all(
    Object.entries(imgs).map(async ([name, data]) => {
      const getImage = images[name];
      if (!getImage) {
        return null;
      }
      try {
        const url = await getImage(data.width, data.height);
        return {
          id: data.id,
          url,
        } as TemplateImage;
      } catch (error) {
        console.error('Error getting image:', error);
        return null;
      }
    })
  );
  return list.filter(v => !!v);
};

export type PPTSection = {
  title: string;
  content: string;
  keywords: string;
};

export type TemplateImage = {
  id: string;
  url: string;
};

type DocTemplate = {
  images: TemplateImage[];
  content: unknown;
};

const createBasicCover = async (
  title: string,
  section1: PPTSection
): Promise<DocTemplate> => {
  const templates = (await import('./templates/cover.json')).default;
  const template = getRandomElement(templates);
  replaceText(
    {
      title: title,
      'section1.title': section1.title,
      'section1.content': section1.content,
    },
    template
  );
  return {
    images: await getImages(
      {
        'section1.image': getImageUrlByKeyword(section1.keywords),
      },
      template
    ),
    content: template,
  };
};

function getRandomElement<T>(arr: T[]): T {
  return JSON.parse(
    JSON.stringify(arr[Math.floor(Math.random() * arr.length)])
  );
}

const basic1section = async (
  title: string,
  section1: PPTSection
): Promise<DocTemplate> => {
  const templates = (await import('./templates/one.json')).default;
  const template = getRandomElement(templates);
  replaceText(
    {
      title: title,
      'section1.title': section1.title,
      'section1.content': section1.content,
    },
    template
  );
  const images = await getImages(
    {
      'section1.image': getImageUrlByKeyword(section1.keywords),
      'section1.image2': getImageUrlByKeyword(section1.keywords),
      'section1.image3': getImageUrlByKeyword(section1.keywords),
    },
    template
  );

  return {
    images: images,
    content: template,
  };
};

const basic2section = async (
  title: string,
  section1: PPTSection,
  section2: PPTSection
): Promise<DocTemplate> => {
  const templates = (await import('./templates/two.json')).default;
  const template = getRandomElement(templates);
  replaceText(
    {
      title: title,
      'section1.title': section1.title,
      'section1.content': section1.content,
      'section2.title': section2.title,
      'section2.content': section2.content,
    },
    template
  );
  return {
    images: await getImages(
      {
        'section1.image': getImageUrlByKeyword(section1.keywords),
        'section2.image': getImageUrlByKeyword(section2.keywords),
        background: () =>
          'https://cdn.affine.pro/ppt-images/background/basic_2_selection_background.png',
      },
      template
    ),
    content: template,
  };
};

const basic3section = async (
  title: string,
  section1: PPTSection,
  section2: PPTSection,
  section3: PPTSection
): Promise<DocTemplate> => {
  const templates = (await import('./templates/three.json')).default;
  const template = getRandomElement(templates);
  replaceText(
    {
      title: title,
      'section1.title': section1.title,
      'section1.content': section1.content,
      'section2.title': section2.title,
      'section2.content': section2.content,
      'section3.title': section3.title,
      'section3.content': section3.content,
    },
    template
  );
  return {
    images: await getImages(
      {
        'section1.image': getImageUrlByKeyword(section1.keywords),
        'section2.image': getImageUrlByKeyword(section2.keywords),
        'section3.image': getImageUrlByKeyword(section3.keywords),
        background: () =>
          'https://cdn.affine.pro/ppt-images/background/basic_3_selection_background.png',
      },
      template
    ),
    content: template,
  };
};

const basic4section = async (
  title: string,
  section1: PPTSection,
  section2: PPTSection,
  section3: PPTSection,
  section4: PPTSection
): Promise<DocTemplate> => {
  const templates = (await import('./templates/four.json')).default;
  const template = getRandomElement(templates);
  replaceText(
    {
      title: title,
      'section1.title': section1.title,
      'section1.content': section1.content,
      'section2.title': section2.title,
      'section2.content': section2.content,
      'section3.title': section3.title,
      'section3.content': section3.content,
      'section4.title': section4.title,
      'section4.content': section4.content,
    },
    template
  );
  return {
    images: await getImages(
      {
        'section1.image': getImageUrlByKeyword(section1.keywords),
        'section2.image': getImageUrlByKeyword(section2.keywords),
        'section3.image': getImageUrlByKeyword(section3.keywords),
        'section4.image': getImageUrlByKeyword(section4.keywords),
        background: () =>
          'https://cdn.affine.pro/ppt-images/background/basic_4_selection_background.png',
      },
      template
    ),
    content: template,
  };
};

export type PPTDoc = {
  isCover: boolean;
  title: string;
  sections: PPTSection[];
};

export const basicTheme = (doc: PPTDoc) => {
  if (doc.isCover) {
    return createBasicCover(doc.title, doc.sections[0]);
  }
  if (doc.sections.length === 1) {
    return basic1section(doc.title, doc.sections[0]);
  }
  if (doc.sections.length === 2) {
    return basic2section(doc.title, doc.sections[0], doc.sections[1]);
  }
  if (doc.sections.length === 3) {
    return basic3section(
      doc.title,
      doc.sections[0],
      doc.sections[1],
      doc.sections[2]
    );
  }
  return basic4section(
    doc.title,
    doc.sections[0],
    doc.sections[1],
    doc.sections[2],
    doc.sections[3]
  );
};
