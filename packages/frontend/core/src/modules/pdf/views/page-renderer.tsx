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
  const [shouldLoadPage, setShouldLoadPage] = useState(false);

  // 1. Check cache
  useEffect(() => {
    if (!visibility) {
      setShouldLoadPage(false);
      return;
    }
    if (cachedBitmap) {
      setShouldLoadPage(false);
      return;
    }

    setShouldLoadPage(false);

    if (!width || !height) return;

    let cancelled = false;

    (async () => {
      const compressed = await getReusableBitmap({
        blobId: pdf.id,
        pageNum,
        width,
        height,
        scale,
      });

      if (!cancelled) {
        if (compressed) {
          setCachedBitmap(compressed);
        } else {
          setShouldLoadPage(true);
        }
      }
    })().catch(() => {
      if (!cancelled) setShouldLoadPage(true);
    });

    return () => {
      cancelled = true;
    };
  }, [visibility, cachedBitmap, pdf.id, pageNum, width, height, scale]);

  // 2. Load Page
  useEffect(() => {
    if (!shouldLoadPage) return;

    const key = `${width}:${height}:${scale}`;
    const { page, release } = pdf.page(pageNum, key);
    setPage(page);

    return () => {
      release();
      setPage(null);
    };
  }, [shouldLoadPage, pdf, pageNum, width, height, scale]);

  // 3. Render Page
  useEffect(() => {
    if (!page || !shouldLoadPage) return;

    page.render({ width, height, scale });

    return () => {
      page.render.unsubscribe();
    };
  }, [page, shouldLoadPage, width, height, scale]);

  // 4. Cache new bitmap
  useEffect(() => {
    if (!img || !shouldLoadPage) return;

    cacheBitmap({ blobId: pdf.id, pageNum, width, height, scale }, img).catch(
      e => console.error('Failed to cache bitmap', e)
    );
  }, [img, shouldLoadPage, pdf.id, pageNum, width, height, scale]);

  return {
    displayImg: cachedBitmap ?? img,
    error,
  };
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
