import { observeIntersection } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData } from '@toeverything/infra';
import { debounce } from 'lodash-es';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { cacheBitmap, getReusableBitmap } from '../cache/bitmap-cache';
import type { PDF } from '../entities/pdf';
import type { PDFPage } from '../entities/pdf-page';
import type { PageSize } from '../renderer/types';
import { LoadingSvg, PDFPageCanvas } from './components';
import * as styles from './styles.css';

interface PDFPageProps {
  pdf: PDF;
  pageNum: number;
  actualSize: PageSize;
  maxSize: PageSize;
  viewportInfo: PageSize;
  resize: (
    viewportInfo: PageSize,
    actualSize: PageSize,
    maxSize: PageSize,
    isThumbnail?: boolean
  ) => { aspectRatio: number } & PageSize;
  scale?: number;
  className?: string;
  onSelect?: (pageNum: number) => void;
  isThumbnail?: boolean;
}

function usePDFPage({
  pdf,
  pageNum,
  width,
  height,
  scale,
  visibility,
}: {
  pdf: PDF;
  pageNum: number;
  width: number;
  height: number;
  scale: number;
  visibility: boolean;
}) {
  const [page, setPage] = useState<PDFPage | null>(null);
  const [cachedBitmap, setCachedBitmap] = useState<ImageBitmap | null>(null);
  const img = useLiveData(useMemo(() => (page ? page.bitmap$ : null), [page]));
  const error = useLiveData(page?.error$ ?? null);

  // Consolidated effect to handle loading strategy (Cache vs Render)
  useEffect(() => {
    if (!visibility || !width || !height) {
      setPage(null);
      return;
    }

    let active = true;
    let releasePage: (() => void) | undefined;

    const load = async () => {
      try {
        // 1. Try cache
        const compressed = await getReusableBitmap({
          blobId: pdf.id,
          pageNum,
          width,
          height,
          scale,
        });

        if (!active) return;

        if (compressed) {
          setCachedBitmap(compressed);
          setPage(null);
        } else {
          // 2. Load Page
          setCachedBitmap(null); // Clear stale cache

          const key = `${width}:${height}:${scale}`;
          const { page: newPage, release } = pdf.page(pageNum, key);
          releasePage = release;

          setPage(newPage);
          newPage.render({ width, height, scale });
        }
      } catch (e) {
        console.error('Failed to load PDF page', e);
      }
    };

    load().catch(console.error);

    return () => {
      active = false;
      releasePage?.();
      setPage(null);
    };
  }, [visibility, pdf, pageNum, width, height, scale]);

  // Cache new bitmap when generated
  useEffect(() => {
    if (!img || !page) return;

    cacheBitmap({ blobId: pdf.id, pageNum, width, height, scale }, img).catch(
      e => console.error('Failed to cache bitmap', e)
    );
  }, [img, page, pdf.id, pageNum, width, height, scale]);

  return { displayImg: cachedBitmap ?? img, error };
}

export const PDFPageRenderer = ({
  pdf,
  pageNum,
  className,
  actualSize,
  maxSize,
  viewportInfo,
  onSelect,
  resize,
  isThumbnail,
  scale = window.devicePixelRatio,
}: PDFPageProps) => {
  const t = useI18n();
  const pageViewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useMemo(
    () => resize(viewportInfo, actualSize, maxSize, isThumbnail),
    [resize, viewportInfo, actualSize, maxSize, isThumbnail]
  );
  const [visibility, setVisibility] = useState(false);

  const { displayImg, error } = usePDFPage({
    pdf,
    pageNum,
    width: size.width,
    height: size.height,
    scale,
    visibility,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!displayImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = displayImg.width;
    canvas.height = displayImg.height;
    ctx.drawImage(displayImg, 0, 0);
  }, [displayImg]);

  useEffect(() => {
    const pageView = pageViewRef.current;
    if (!pageView) return;

    return observeIntersection(
      pageView,
      debounce(
        entry => {
          setVisibility(entry.isIntersecting);
        },
        377,
        {
          trailing: true,
        }
      )
    );
  }, []);

  return (
    <div
      ref={pageViewRef}
      className={className}
      style={resize?.(viewportInfo, actualSize, maxSize, isThumbnail)}
      onClick={() => onSelect?.(pageNum)}
    >
      <PageRendererInner
        img={displayImg}
        ref={canvasRef}
        err={error ? t['com.affine.pdf.page.render.error']() : null}
        scale={scale}
      />
    </div>
  );
};

interface PageRendererInnerProps {
  img: ImageBitmap | null;
  err: string | null;
  scale: number;
}

const PageRendererInner = forwardRef<HTMLCanvasElement, PageRendererInnerProps>(
  ({ img, err, scale }, ref) => {
    if (img) {
      const { width, height } = img;
      return (
        <PDFPageCanvas
          ref={ref}
          style={{
            height: height / scale,
            aspectRatio: `${width} / ${height}`,
          }}
        />
      );
    }

    if (err) {
      return <p className={styles.pdfPageError}>{err}</p>;
    }

    return <LoadingSvg />;
  }
);

PageRendererInner.displayName = 'pdf-page-renderer-inner';
