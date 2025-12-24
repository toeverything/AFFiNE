// eslint-disable
// @ts-nocheck
import { Node } from './utils/node';
import { encodeLink } from './utils/url';

export interface InlineReference {
  type: 'LinkedPage';
  pageId: string;
  title?: string;
  params?: { mode: 'doc' | 'edgeless' };
}

export interface ConverterOptions {
  convertInlineReferenceLink?: (reference: InlineReference) => {
    title: string;
    link: string;
  };
}

const defaultConvertInlineReferenceLink = (reference: InlineReference) => {
  return {
    title: reference.title || '',
    link: [reference.type, reference.pageId, reference.params?.mode]
      .filter(Boolean)
      .join(':'),
  };
};

export function getConverters(opts: ConverterOptions = {}) {
  const { convertInlineReferenceLink = defaultConvertInlineReferenceLink } =
    opts;

  return {
    embed: {
      image: function (src) {
        this.append('![](' + encodeLink(src) + ')');
      },
      // Not a default Quill feature, converts custom divider embed blot added when
      // creating quill editor instance.
      // See https://quilljs.com/guides/cloning-medium-with-parchment/#dividers
      thematic_break: function () {
        this.open = '\n---\n' + this.open;
      },
    },

    inline: {
      italic: function () {
        return ['_', '_'];
      },
      bold: function () {
        return ['**', '**'];
      },
      link: function (url) {
        return ['[', '](' + url + ')'];
      },
      reference: function (reference: InlineReference) {
        const { title, link } = convertInlineReferenceLink(reference);
        return ['[', `${title}](${link})`];
      },
      strike: function () {
        return ['~~', '~~'];
      },
      code: function () {
        return ['`', '`'];
      },
    },

    block: {
      header: function ({ header }) {
        this.open = '#'.repeat(header) + ' ' + this.open;
      },
      blockquote: function () {
        this.open = '> ' + this.open;
      },
      list: {
        group: function () {
          return new Node(['', '\n']);
        },
        line: function (attrs, group) {
          if (attrs.list === 'bullet') {
            this.open = '- ' + this.open;
          } else if (attrs.list === 'checked') {
            this.open = '- [x] ' + this.open;
          } else if (attrs.list === 'unchecked') {
            this.open = '- [ ] ' + this.open;
          } else if (attrs.list === 'ordered') {
            group.count = group.count || 0;
            var count = ++group.count;
            this.open = count + '. ' + this.open;
          }
        },
      },
    },
  };
}
