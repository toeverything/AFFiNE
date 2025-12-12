import type {
  TableCellSerialized,
  TableColumn,
  TableRow,
} from '@blocksuite/affine-model';
import type { ServiceProvider } from '@blocksuite/global/di';
import {
  BaseAdapter,
  type BlockSnapshot,
  type DocSnapshot,
  type FromBlockSnapshotPayload,
  type FromBlockSnapshotResult,
  type FromDocSnapshotPayload,
  type FromDocSnapshotResult,
  type FromSliceSnapshotPayload,
  type FromSliceSnapshotResult,
  type SliceSnapshot,
  type ToBlockSnapshotPayload,
  type ToDocSnapshotPayload,
  type ToSliceSnapshotPayload,
  type Transformer,
} from '@blocksuite/store';
import DOMPurify from 'dompurify';
import pdfMake from 'pdfmake/build/pdfmake';
import type {
  Content,
  ContentText,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import { getNumberPrefix } from '../../utils';
import { resolveCssVariable } from './css-utils.js';
import { extractTextWithInline } from './delta-converter.js';
import {
  calculateImageDimensions,
  extractImageDimensions,
  extractSvgDimensions,
} from './image-utils.js';
import {
  getBulletIconSvg,
  getCheckboxIconSvg,
  getToggleIconSvg,
} from './svg-utils.js';
import {
  BLOCK_CHILDREN_CONTAINER_PADDING_LEFT,
  getImagePlaceholder,
  hasTextContent,
  PDF_COLORS,
  TABLE_LAYOUT_NO_BORDERS,
  textContentToString,
} from './utils.js';

pdfMake.fonts = {
  Inter: {
    normal: 'https://cdn.affine.pro/fonts/Inter-Regular.woff',
    bold: 'https://cdn.affine.pro/fonts/Inter-SemiBold.woff',
    italics: 'https://cdn.affine.pro/fonts/Inter-Italic.woff',
    bolditalics: 'https://cdn.affine.pro/fonts/Inter-SemiBoldItalic.woff',
  },
  SarasaGothicCL: {
    normal: 'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
    bold: 'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
    italics: 'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
    bolditalics: 'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
  },
};

export type PdfAdapterFile = {
  blob: Blob;
  fileName: string;
};

/**
 * PDF export adapter using pdfmake library.
 *
 * This adapter converts BlockSuite documents to PDF format. It is export-only
 * and does not support importing from PDF.
 *
 * @example
 * ```typescript
 * const adapter = new PdfAdapter(job, provider);
 * const result = await adapter.fromDocSnapshot({ snapshot, assets });
 * download(result.file.blob, result.file.fileName);
 * ```
 */
export class PdfAdapter extends BaseAdapter<PdfAdapterFile> {
  constructor(job: Transformer, provider: ServiceProvider) {
    super(job, provider);
  }

  async fromBlockSnapshot({
    snapshot,
    assets,
  }: FromBlockSnapshotPayload): Promise<
    FromBlockSnapshotResult<PdfAdapterFile>
  > {
    const content = await this._buildContent([snapshot], assets);
    const definition = this._createDocDefinition(undefined, content);
    const blob = await this._createPdfBlob(definition);
    return {
      file: {
        blob,
        fileName: 'block.pdf',
      },
      assetsIds: [],
    };
  }

  async fromDocSnapshot({
    snapshot,
    assets,
  }: FromDocSnapshotPayload): Promise<FromDocSnapshotResult<PdfAdapterFile>> {
    const content = await this._buildContent([snapshot.blocks], assets);
    const definition = this._createDocDefinition(snapshot.meta?.title, content);
    const blob = await this._createPdfBlob(definition);
    return {
      file: {
        blob,
        fileName: `${snapshot.meta?.title || 'Untitled'}.pdf`,
      },
      assetsIds: [],
    };
  }

  async fromSliceSnapshot({
    snapshot,
    assets,
  }: FromSliceSnapshotPayload): Promise<
    FromSliceSnapshotResult<PdfAdapterFile>
  > {
    const content = await this._buildContent(snapshot.content, assets);
    const definition = this._createDocDefinition(undefined, content);
    const blob = await this._createPdfBlob(definition);
    return {
      file: {
        blob,
        fileName: 'slice.pdf',
      },
      assetsIds: [],
    };
  }

  toBlockSnapshot(
    _payload: ToBlockSnapshotPayload<PdfAdapterFile>
  ): BlockSnapshot {
    throw new Error('PdfAdapter does not support importing blocks from PDF.');
  }

  toDocSnapshot(_payload: ToDocSnapshotPayload<PdfAdapterFile>): DocSnapshot {
    throw new Error('PdfAdapter does not support importing docs from PDF.');
  }

  toSliceSnapshot(
    _payload: ToSliceSnapshotPayload<PdfAdapterFile>
  ): SliceSnapshot | null {
    throw new Error('PdfAdapter does not support importing slices from PDF.');
  }

  /**
   * Get the pdfmake document definition (for testing purposes)
   */
  async getDocDefinition(
    blocks: BlockSnapshot[],
    title?: string,
    assets?: FromDocSnapshotPayload['assets']
  ): Promise<TDocumentDefinitions> {
    const content = await this._buildContent(blocks, assets);
    return this._createDocDefinition(title, content);
  }

  private async _buildContent(
    blocks: BlockSnapshot[],
    assets?: FromDocSnapshotPayload['assets']
  ): Promise<Content[]> {
    const content: Content[] = [];
    for (const block of blocks) {
      const blockContent = await this._blockToContent(block, assets, 0, 0, 0);
      content.push(...blockContent);
    }
    return content;
  }

  private async _blockToContent(
    block: BlockSnapshot,
    assets?: FromDocSnapshotPayload['assets'],
    depth: number = 0,
    listNestingLevel: number = 0,
    parentTextStart: number = 0
  ): Promise<Content[]> {
    const content: Content[] = [];
    const flavour = block.flavour;
    const props = block.props as Record<string, any>;
    const textContent = extractTextWithInline(props, this.configs);

    const baseIndent =
      parentTextStart > 0
        ? parentTextStart
        : depth * BLOCK_CHILDREN_CONTAINER_PADDING_LEFT;

    if (flavour === 'affine:paragraph') {
      content.push(
        ...(await this._createParagraphContent(
          props,
          textContent,
          baseIndent,
          block,
          assets,
          depth
        ))
      );
    } else if (flavour === 'affine:list') {
      content.push(
        ...(await this._createListContent(
          props,
          textContent,
          baseIndent,
          listNestingLevel,
          block
        ))
      );
    } else if (flavour === 'affine:code') {
      content.push(...this._createCodeContent(props, textContent, baseIndent));
    } else if (flavour === 'affine:divider') {
      content.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 1,
            lineColor: PDF_COLORS.border,
          },
        ],
        margin: [0, 10, 0, 10],
      });
    } else if (flavour === 'affine:callout') {
      const calloutContent = await this._createCalloutContent(
        props,
        textContent,
        baseIndent,
        block,
        assets,
        depth
      );
      content.push(...calloutContent);
      return content;
    } else if (flavour === 'affine:bookmark') {
      content.push({
        text: props.title || props.url || '',
        link: props.url,
        color: PDF_COLORS.link,
        margin: [0, 2, 0, 2],
      });
    } else if (flavour === 'affine:image') {
      const imageContent = await this._createImageContent(
        props.sourceId,
        props.caption || '',
        assets,
        props.textAlign || 'center',
        props.width,
        props.height
      );
      content.push(...imageContent);
    } else if (flavour === 'affine:latex') {
      content.push({
        text: props.latex || '',
        margin: [baseIndent, 5, 0, 5],
        italics: true,
        color: PDF_COLORS.textMuted,
        alignment: 'center',
      });
    } else if (flavour === 'affine:database') {
      content.push(...this._createDatabaseContent(props));
      return content;
    } else if (flavour === 'affine:table') {
      const tableContent = await this._createTableContent(props);
      if (tableContent) {
        content.push(tableContent);
      }
    } else if (
      flavour === 'affine:embed-linked-doc' ||
      flavour === 'affine:embed-synced-doc'
    ) {
      content.push(this._createLinkedDocContent(props, baseIndent));
    } else if (hasTextContent(textContent)) {
      content.push({
        text: textContent,
        margin: [0, 2, 0, 2],
      });
    }

    if (block.children && block.children.length) {
      const shouldIncrementDepth =
        flavour !== 'affine:page' && flavour !== 'affine:note';
      const childDepth = shouldIncrementDepth ? depth + 1 : depth;

      const childListNestingLevel =
        flavour === 'affine:list'
          ? listNestingLevel + 1
          : parentTextStart > 0
            ? listNestingLevel
            : 0;

      const childParentTextStart =
        flavour === 'affine:list'
          ? baseIndent + BLOCK_CHILDREN_CONTAINER_PADDING_LEFT
          : parentTextStart > 0
            ? parentTextStart
            : 0;

      for (const child of block.children) {
        const childContent = await this._blockToContent(
          child,
          assets,
          childDepth,
          childListNestingLevel,
          childParentTextStart
        );
        content.push(...childContent);
      }
    }

    return content;
  }

  private async _createParagraphContent(
    props: Record<string, any>,
    textContent: string | Array<string | { text: string; [key: string]: any }>,
    baseIndent: number,
    block: BlockSnapshot,
    assets?: FromDocSnapshotPayload['assets'],
    depth: number = 0
  ): Promise<Content[]> {
    const type = props.type || 'text';
    const textAlign = props.textAlign || 'left';
    const styleMap: Record<string, string> = {
      h1: 'header1',
      h2: 'header2',
      h3: 'header3',
      h4: 'header4',
      h5: 'header4',
      h6: 'header4',
    };
    const style = styleMap[type];

    if (type === 'quote') {
      return this._createQuoteContent(
        textContent,
        baseIndent,
        block,
        assets,
        depth
      );
    }

    const paragraphContent: Content = style
      ? { text: textContent, style, margin: [baseIndent, 6, 0, 3] }
      : { text: textContent, margin: [baseIndent, 2, 0, 2] };

    if (textAlign && textAlign !== 'left') {
      paragraphContent.alignment = textAlign;
    }

    return [paragraphContent];
  }

  private async _createQuoteContent(
    textContent: string | Array<string | { text: string; [key: string]: any }>,
    baseIndent: number,
    block: BlockSnapshot,
    assets?: FromDocSnapshotPayload['assets'],
    depth: number = 0
  ): Promise<Content[]> {
    const quoteContent: Content[] = [];

    if (hasTextContent(textContent)) {
      quoteContent.push({
        text: textContent,
        margin: [0, 5, 10, 5],
      });
    }

    const childrenContent = await this._processChildrenWithMargins(
      block,
      assets,
      depth,
      0,
      10
    );
    quoteContent.push(...childrenContent);

    return [
      {
        table: {
          widths: [2, '*'],
          body: [
            [
              { text: ' ', fillColor: PDF_COLORS.border },
              {
                stack: quoteContent.length > 0 ? quoteContent : [{ text: ' ' }],
                margin: [10, 0, 0, 0],
              },
            ],
          ],
        },
        margin: [baseIndent, 5, 0, 5],
        layout: TABLE_LAYOUT_NO_BORDERS,
      },
    ];
  }

  private async _createListContent(
    props: Record<string, any>,
    textContent: string | Array<string | { text: string; [key: string]: any }>,
    baseIndent: number,
    listNestingLevel: number,
    block: BlockSnapshot
  ): Promise<Content[]> {
    const type = props.type || 'bulleted';
    const checked = props.checked || false;
    const order = props.order;

    let prefixSvg: string | null = null;
    let prefixText: string | null = null;

    if (type === 'numbered') {
      const number =
        order !== null && order !== undefined ? order : listNestingLevel + 1;
      prefixText = `${getNumberPrefix(number, listNestingLevel)} `;
    } else if (type === 'todo') {
      prefixSvg = getCheckboxIconSvg(checked);
    } else if (type === 'toggle') {
      const hasChildren = block.children && block.children.length > 0;
      prefixSvg = getToggleIconSvg(hasChildren);
    } else {
      prefixSvg = getBulletIconSvg(listNestingLevel);
    }

    const listText = Array.isArray(textContent)
      ? textContent.length === 0
        ? ' '
        : textContent
      : textContent;

    const blueColor = resolveCssVariable('var(--affine-blue-700)') || '#1E96EB';

    const iconCell: Content = prefixSvg
      ? {
          svg: prefixSvg,
          width: 16,
          margin: [0, 0, 4, 0],
        }
      : prefixText
        ? {
            text: prefixText,
            color: blueColor,
            alignment: 'left',
          }
        : { text: '' };

    const textCell: Content =
      typeof listText === 'string'
        ? { text: listText }
        : listText.length === 1
          ? typeof listText[0] === 'string'
            ? { text: listText[0] }
            : listText[0]
          : { text: listText };

    return [
      {
        table: {
          widths: [BLOCK_CHILDREN_CONTAINER_PADDING_LEFT, '*'],
          body: [[iconCell, textCell]],
        },
        margin: [baseIndent, 2, 0, 2],
        layout: TABLE_LAYOUT_NO_BORDERS,
      },
    ];
  }

  private _createCodeContent(
    props: Record<string, any>,
    textContent: string | Array<string | { text: string; [key: string]: any }>,
    baseIndent: number
  ): Content[] {
    const language = props.language || '';
    const lineNumber = props.lineNumber !== false;
    const codeText =
      typeof textContent === 'string'
        ? textContent
        : textContentToString(textContent);
    const lines = codeText.split('\n');

    const tableBody: any[][] = [];
    if (lineNumber && lines.length > 1) {
      const maxLineNumLength = lines.length.toString().length;
      for (let i = 0; i < lines.length; i++) {
        const lineNum = (i + 1).toString().padStart(maxLineNumLength, ' ');
        const isFirstLine = i === 0;
        const isLastLine = i === lines.length - 1;

        tableBody.push([
          {
            text: lineNum,
            style: 'code',
            alignment: 'right',
            fillColor: PDF_COLORS.codeBackground,
            margin: [5, isFirstLine ? 20 : 0, 5, isLastLine ? 20 : 0],
          },
          {
            text: lines[i],
            style: 'code',
            fillColor: PDF_COLORS.codeBackground,
            margin: [5, isFirstLine ? 20 : 0, 10, isLastLine ? 20 : 0],
          },
        ]);
      }
    } else {
      tableBody.push([
        {
          text: codeText,
          style: 'code',
          fillColor: PDF_COLORS.codeBackground,
          margin: [10, 5, 10, 5],
          colSpan: 2,
        },
        '',
      ]);
    }

    const codeBlockContent: Content[] = [
      {
        table: {
          widths: ['auto', '*'],
          body: tableBody,
        },
        margin: [baseIndent, 5, 0, 5],
        layout: 'noBorders',
      },
    ];

    if (language) {
      codeBlockContent.push({
        text: `Language: ${language}`,
        fontSize: 9,
        color: PDF_COLORS.textDisabled,
        margin: [baseIndent + 10, 0, 0, 5],
        italics: true,
      });
    }

    return codeBlockContent;
  }

  private async _createCalloutContent(
    props: Record<string, any>,
    textContent: string | Array<string | { text: string; [key: string]: any }>,
    baseIndent: number,
    block: BlockSnapshot,
    assets?: FromDocSnapshotPayload['assets'],
    depth: number = 0
  ): Promise<Content[]> {
    const backgroundColorName = props.backgroundColorName || 'grey';
    const colorVar =
      backgroundColorName === 'default' || backgroundColorName === 'grey'
        ? 'var(--affine-v2-block-callout-background-grey)'
        : `var(--affine-v2-block-callout-background-${backgroundColorName})`;
    const backgroundColor = resolveCssVariable(colorVar) || '#f5f5f5';

    const calloutContent: Content[] = [];

    if (hasTextContent(textContent)) {
      calloutContent.push({
        text: textContent,
        margin: [10, 5, 10, 0],
      });
    }

    const childrenContent = await this._processChildrenWithMargins(
      block,
      assets,
      depth,
      10,
      10
    );
    calloutContent.push(...childrenContent);

    return [
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack:
                  calloutContent.length > 0 ? calloutContent : [{ text: ' ' }],
                fillColor: backgroundColor,
                margin: [10, 5, 10, 5],
              },
            ],
          ],
        },
        margin: [baseIndent, 5, 0, 5],
        layout: 'noBorders',
      },
    ];
  }

  private _createDatabaseContent(props: Record<string, any>): Content[] {
    let titleText:
      | string
      | Array<string | { text: string; [key: string]: any }> = '';

    if (props.title) {
      if (props.title.delta && Array.isArray(props.title.delta)) {
        titleText = extractTextWithInline(
          { text: { delta: props.title.delta } },
          this.configs
        );
      } else if (props.title.delta) {
        titleText = extractTextWithInline({ text: props.title }, this.configs);
      }
    }

    const content: Content[] = [];

    if (hasTextContent(titleText)) {
      content.push({
        text: titleText,
        bold: true,
        margin: [0, 5, 0, 2],
      });
    }

    content.push({
      text: '[Data View - Not exported]',
      italics: true,
      color: PDF_COLORS.textDisabled,
      margin: [0, 2, 0, 5],
    });

    return content;
  }

  private _adjustMargins(
    content: Content[],
    leftAdjustment: number,
    rightAdjustment: number
  ): Content[] {
    return content.map(item => {
      if (typeof item === 'object' && 'margin' in item && item.margin) {
        const margin = item.margin;
        const marginArray = Array.isArray(margin)
          ? margin
          : [margin, margin, margin, margin];
        const marginTuple: [number, number, number, number] = [
          (marginArray[0] || 0) + leftAdjustment,
          marginArray[1] || 0,
          (marginArray[2] || 0) + rightAdjustment,
          marginArray[3] || 0,
        ];
        return {
          ...item,
          margin: marginTuple,
        };
      }
      return item;
    });
  }

  private _createLinkedDocContent(
    props: Record<string, any>,
    baseIndent: number
  ): Content {
    const pageId = props.pageId || '';
    const titleAlias = props.title;
    const configTitle = this.configs.get('title:' + pageId);
    const pageTitle = titleAlias || configTitle;
    const isPageFound = configTitle !== undefined || titleAlias !== undefined;
    const displayTitle = pageTitle || 'Page not found';

    const docLinkBaseUrl = this.configs.get('docLinkBaseUrl') || '';
    const linkUrl =
      docLinkBaseUrl && pageId ? `${docLinkBaseUrl}/${pageId}` : '';

    const linkedDocContent: Content[] = [
      {
        text: displayTitle,
        bold: true,
        fontSize: 14,
        margin: [15, 10, 15, 5],
        decoration: isPageFound ? undefined : 'lineThrough',
        color: isPageFound ? PDF_COLORS.text : PDF_COLORS.textDisabled,
        link: linkUrl || undefined,
      },
    ];

    if (isPageFound) {
      linkedDocContent.push({
        text: 'Linked Document',
        fontSize: 10,
        color: PDF_COLORS.textMuted,
        margin: [15, 0, 15, 10],
      });
    }

    return {
      table: {
        widths: ['*'],
        body: [
          [{ stack: linkedDocContent, fillColor: PDF_COLORS.cardBackground }],
        ],
      },
      margin: [baseIndent, 5, 0, 5],
      layout: 'noBorders',
    };
  }

  private async _createImageContent(
    sourceId: string | undefined,
    caption: string,
    assets?: FromDocSnapshotPayload['assets'],
    textAlign: string = 'center',
    blockWidth?: number,
    blockHeight?: number
  ): Promise<Content[]> {
    if (!sourceId) {
      return [this._getImagePlaceholderContent(caption)];
    }

    try {
      const manager = assets ?? this.job.assetsManager;
      if (!manager) {
        throw new Error('Asset manager not available');
      }
      await manager.readFromBlob(sourceId);
      const blob = manager.getAssets().get(sourceId);
      if (!blob) {
        throw new Error('Image asset not found');
      }

      const text = await blob.text();
      const trimmedText = text.trim();

      if (trimmedText.startsWith('<svg')) {
        const svgContent = DOMPurify.sanitize(trimmedText, {
          USE_PROFILES: { svg: true },
        });
        const svgDimensions = extractSvgDimensions(svgContent);
        const dimensions = calculateImageDimensions(
          blockWidth,
          blockHeight,
          svgDimensions.width,
          svgDimensions.height
        );

        const content: Content[] = [
          {
            svg: svgContent,
            ...(dimensions.width && { width: dimensions.width }),
            ...(dimensions.height && { height: dimensions.height }),
            margin: [0, 5, 0, 5],
            alignment: textAlign as 'left' | 'center' | 'right',
          },
        ];

        if (caption) {
          content.push({
            text: caption,
            italics: true,
            fontSize: 10,
            color: PDF_COLORS.textMuted,
            margin: [0, 2, 0, 10],
            alignment: textAlign as 'left' | 'center' | 'right',
          });
        }

        return content;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const isJPEG = data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
      const isPNG =
        data.length >= 4 &&
        data[0] === 0x89 &&
        data[1] === 0x50 &&
        data[2] === 0x4e &&
        data[3] === 0x47;

      if (!isJPEG && !isPNG) {
        return [this._getImagePlaceholderContent(caption)];
      }

      const imageDimensions = await extractImageDimensions(blob);
      const dimensions = calculateImageDimensions(
        blockWidth,
        blockHeight,
        imageDimensions.width,
        imageDimensions.height
      );

      // pdfmake (via pdfkit) accepts ArrayBuffer for images, though the types don't reflect this
      const imageBuffer = arrayBuffer as never as string;
      const content: Content[] = [
        {
          image: imageBuffer,
          ...(dimensions.width && { width: dimensions.width }),
          ...(dimensions.height && { height: dimensions.height }),
          margin: [0, 5, 0, 5],
          alignment: textAlign as 'left' | 'center' | 'right',
        },
      ];

      if (caption) {
        content.push({
          text: caption,
          italics: true,
          fontSize: 10,
          color: PDF_COLORS.textMuted,
          margin: [0, 2, 0, 10],
          alignment: textAlign as 'left' | 'center' | 'right',
        });
      }

      return content;
    } catch {
      return [this._getImagePlaceholderContent(caption)];
    }
  }

  private async _createTableContent(
    props: Record<string, any>
  ): Promise<Content | null> {
    const columns: Record<string, TableColumn> = props.columns || {};
    const rows: Record<string, TableRow> = props.rows || {};
    const cells: Record<string, TableCellSerialized> = props.cells || {};

    const sortedColumns = Object.values(columns).sort((a, b) =>
      (a.order || '').localeCompare(b.order || '')
    );
    const sortedRows = Object.values(rows).sort((a, b) =>
      (a.order || '').localeCompare(b.order || '')
    );

    if (sortedRows.length === 0 || sortedColumns.length === 0) {
      return null;
    }

    const tableBody: any[][] = [];
    for (const row of sortedRows) {
      const rowData: any[] = [];
      for (const col of sortedColumns) {
        const cellKey = `${(row as any).rowId}:${(col as any).columnId}`;
        const cell = cells[cellKey];
        if (cell?.text?.delta) {
          const cellText = extractTextWithInline(
            { text: cell.text },
            this.configs
          );
          rowData.push(cellText);
        } else {
          rowData.push('');
        }
      }
      tableBody.push(rowData);
    }

    return {
      table: {
        headerRows: 0,
        widths: Array(sortedColumns.length).fill('*'),
        body: tableBody,
      },
      margin: [0, 5, 0, 5],
      layout: {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === node.table.body.length) return 1;
          return 0.5;
        },
        vLineWidth: () => 0.5,
        hLineColor: () => PDF_COLORS.border,
        vLineColor: () => PDF_COLORS.border,
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
    };
  }

  private async _processChildrenWithMargins(
    block: BlockSnapshot,
    assets: FromDocSnapshotPayload['assets'] | undefined,
    depth: number,
    leftAdjustment: number,
    rightAdjustment: number
  ): Promise<Content[]> {
    const content: Content[] = [];
    if (block.children && block.children.length) {
      for (const child of block.children) {
        const childContent = await this._blockToContent(
          child,
          assets,
          depth,
          0,
          0
        );
        const adjustedContent = this._adjustMargins(
          childContent,
          leftAdjustment,
          rightAdjustment
        );
        content.push(...adjustedContent);
      }
    }
    return content;
  }

  private _getImagePlaceholderContent(caption: string): Content {
    return {
      text: getImagePlaceholder(caption),
      italics: true,
      color: PDF_COLORS.textMuted,
      margin: [0, 5, 0, 5],
    };
  }

  private _createDocDefinition(
    title: string | undefined,
    content: Content[]
  ): TDocumentDefinitions {
    const docContent =
      title === undefined
        ? content
        : [
            {
              text: title || 'Untitled',
              style: 'title',
              margin: [0, 0, 0, 20],
            } as ContentText,
            ...content,
          ];

    return {
      content: docContent,
      styles: {
        title: {
          fontSize: 24,
          bold: true,
          alignment: 'left',
        },
        header1: {
          fontSize: 20,
          bold: true,
          alignment: 'left',
        },
        header2: {
          fontSize: 18,
          bold: true,
          alignment: 'left',
        },
        header3: {
          fontSize: 16,
          bold: true,
          alignment: 'left',
        },
        header4: {
          fontSize: 14,
          bold: true,
          alignment: 'left',
        },
        code: {
          fontSize: 10,
          font: 'Inter',
          color: PDF_COLORS.text,
          background: PDF_COLORS.codeBackground,
        },
      },
      defaultStyle: {
        font: 'SarasaGothicCL',
        fontSize: 12,
        lineHeight: 1.5,
      },
    };
  }

  private async _createPdfBlob(
    docDefinition: TDocumentDefinitions
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        pdfDocGenerator.getBlob(blob => resolve(blob));
      } catch (error) {
        reject(error);
      }
    });
  }
}
