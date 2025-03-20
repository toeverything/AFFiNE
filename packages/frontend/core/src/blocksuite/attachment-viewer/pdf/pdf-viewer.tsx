import { IconButton, observeResize } from '@affine/component';
import type { PDF, PDFRendererState } from '@affine/core/modules/pdf';
import { PDFService, PDFStatus } from '@affine/core/modules/pdf';
import {
  Item,
  List,
  ListPadding,
  ListWithSmallGap,
  LoadingSvg,
  PDFPageRenderer,
  type PDFVirtuosoContext,
  type PDFVirtuosoProps,
  Scroller,
  ScrollSeekPlaceholder,
} from '@affine/core/modules/pdf/views';
import track from '@affine/track';
import { CollapseIcon, ExpandIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ScrollSeekConfiguration,
  Virtuoso,
  type VirtuosoHandle,
} from 'react-virtuoso';

import type { AttachmentViewerProps } from '../types';
import * as styles from './styles.css';
import { fitToPage } from './utils';

const THUMBNAIL_WIDTH = 94;

function calculatePageNum(el: HTMLElement, pageCount: number) {
  const { scrollTop, scrollHeight } = el;
  const pageHeight = scrollHeight / pageCount;
  const n = scrollTop / pageHeight;
  const t = n / pageCount;
  const index = Math.floor(n + t);
  const cursor = Math.min(index, pageCount - 1);
  return cursor;
}
export interface PDFViewerInnerProps {
  pdf: PDF;
  state: Extract<PDFRendererState, { status: PDFStatus.Opened }>;
}

export const PDFViewerInner = ({ pdf, state }: PDFViewerInnerProps) => {
  const [cursor, setCursor] = useState(0);
  const [collapsed, setCollapsed] = useState(true);
  const [viewportInfo, setViewportInfo] = useState({ width: 0, height: 0 });

  const viewerRef = useRef<HTMLDivElement>(null);
  const pagesScrollerRef = useRef<HTMLElement | null>(null);
  const pagesScrollerHandleRef = useRef<VirtuosoHandle>(null);
  const thumbnailsScrollerHandleRef = useRef<VirtuosoHandle>(null);

  const updateScrollerRef = useCallback(
    (scroller: HTMLElement | Window | null) => {
      pagesScrollerRef.current = scroller as HTMLElement;
    },
    []
  );

  const onScroll = useCallback(() => {
    const el = pagesScrollerRef.current;
    if (!el) return;

    const { pageCount } = state.meta;
    if (!pageCount) return;

    const cursor = calculatePageNum(el, pageCount);

    setCursor(cursor);
  }, [pagesScrollerRef, state]);

  const onPageSelect = useCallback(
    (index: number) => {
      const scroller = pagesScrollerHandleRef.current;
      if (!scroller) return;

      scroller.scrollToIndex({
        index,
        align: 'center',
        behavior: 'smooth',
      });
    },
    [pagesScrollerHandleRef]
  );

  const pageContent = useCallback(
    (
      index: number,
      _: unknown,
      {
        viewportInfo,
        meta,
        onPageSelect,
        pageClassName,
        resize,
        isThumbnail,
      }: PDFVirtuosoContext
    ) => {
      return (
        <PDFPageRenderer
          key={`${pageClassName}-${index}`}
          pdf={pdf}
          pageNum={index}
          className={pageClassName}
          viewportInfo={viewportInfo}
          actualSize={meta.pageSizes[index]}
          maxSize={meta.maxSize}
          onSelect={onPageSelect}
          resize={resize}
          isThumbnail={isThumbnail}
        />
      );
    },
    [pdf]
  );

  const thumbnailsConfig = useMemo(() => {
    const { height: vh } = viewportInfo;
    const { pageCount, pageSizes, maxSize } = state.meta;
    const t = Math.min(maxSize.width / maxSize.height, 1);
    const pw = THUMBNAIL_WIDTH / t;
    const newMaxSize = {
      width: pw,
      height: pw * (maxSize.height / maxSize.width),
    };
    const newPageSizes = pageSizes.map(({ width, height }) => {
      const w = newMaxSize.width * (width / maxSize.width);
      return {
        width: w,
        height: w * (height / width),
      };
    });
    const height = Math.min(
      vh - 60 - 24 - 24 - 2 - 8,
      newPageSizes.reduce((h, { height }) => h + height * t, 0) +
        (pageCount - 1) * 12
    );
    return {
      context: {
        onPageSelect,
        viewportInfo: {
          width: pw,
          height,
        },
        meta: {
          pageCount,
          maxSize: newMaxSize,
          pageSizes: newPageSizes,
        },
        resize: fitToPage,
        isThumbnail: true,
        pageClassName: styles.pdfThumbnail,
      },
      style: { height },
    };
  }, [state, viewportInfo, onPageSelect]);

  // 1. works fine if they are the same size
  // 2. uses the `observeIntersection` when targeting different sizes
  const scrollSeekConfig = useMemo<ScrollSeekConfiguration>(() => {
    return {
      enter: velocity => Math.abs(velocity) > 1024,
      exit: velocity => Math.abs(velocity) < 10,
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    return observeResize(viewer, ({ contentRect: { width, height } }) =>
      setViewportInfo({ width, height })
    );
  }, []);

  return (
    <div
      ref={viewerRef}
      data-testid="pdf-viewer"
      className={clsx([styles.viewer, { gridding: true, scrollable: true }])}
    >
      <Virtuoso<PDFVirtuosoProps>
        key={pdf.id}
        ref={pagesScrollerHandleRef}
        scrollerRef={updateScrollerRef}
        onScroll={onScroll}
        className={styles.virtuoso}
        totalCount={state.meta.pageCount}
        itemContent={pageContent}
        components={{
          Item,
          List,
          Scroller,
          Header: ListPadding,
          Footer: ListPadding,
          ScrollSeekPlaceholder,
        }}
        context={{
          viewportInfo: {
            width: viewportInfo.width - 40,
            height: viewportInfo.height - 40,
          },
          meta: state.meta,
          resize: fitToPage,
          pageClassName: styles.pdfPage,
        }}
        scrollSeekConfiguration={scrollSeekConfig}
      />
      <div className={clsx(['thumbnails', styles.pdfThumbnails])}>
        <div className={clsx([styles.pdfThumbnailsList, { collapsed }])}>
          <Virtuoso<PDFVirtuosoProps>
            key={`${pdf.id}-thumbnail`}
            ref={thumbnailsScrollerHandleRef}
            className={styles.virtuoso}
            totalCount={state.meta.pageCount}
            itemContent={pageContent}
            components={{
              Item,
              List: ListWithSmallGap,
              Scroller,
              ScrollSeekPlaceholder,
            }}
            style={thumbnailsConfig.style}
            context={thumbnailsConfig.context}
            scrollSeekConfiguration={scrollSeekConfig}
          />
        </div>
        <div className={clsx(['indicator', styles.pdfIndicator])}>
          <div>
            <span className="page-cursor">
              {state.meta.pageCount > 0 ? cursor + 1 : 0}
            </span>
            /<span className="page-count">{state.meta.pageCount}</span>
          </div>
          <IconButton
            icon={collapsed ? <CollapseIcon /> : <ExpandIcon />}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
      </div>
    </div>
  );
};

function PDFViewerStatus({
  pdf,
  ...props
}: AttachmentViewerProps & { pdf: PDF }) {
  const state = useLiveData(pdf.state$);

  useEffect(() => {
    if (state.status !== PDFStatus.Error) return;

    track.$.attachment.$.openPDFRendererFail();
  }, [state]);

  if (state?.status !== PDFStatus.Opened) {
    return <PDFLoading />;
  }

  return <PDFViewerInner {...props} pdf={pdf} state={state} />;
}

export function PDFViewer({ model, ...props }: AttachmentViewerProps) {
  const pdfService = useService(PDFService);
  const [pdf, setPdf] = useState<PDF | null>(null);

  useEffect(() => {
    const { pdf, release } = pdfService.get(model);
    setPdf(pdf);

    return () => {
      release();
    };
  }, [model, pdfService, setPdf]);

  if (!pdf) {
    return <PDFLoading />;
  }

  return <PDFViewerStatus {...props} model={model} pdf={pdf} />;
}

const PDFLoading = () => (
  <div style={{ margin: 'auto' }}>
    <LoadingSvg />
  </div>
);
