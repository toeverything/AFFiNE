import { observeIntersection } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData } from '@toeverything/infra';
import { debounce } from 'lodash-es';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

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
  const [page, setPage] = useState<PDFPage | null>(null);
  const img = useLiveData(useMemo(() => (page ? page.bitmap$ : null), [page]));
  const error = useLiveData(page?.error$ ?? null);
  const size = useMemo(
    () => resize(viewportInfo, actualSize, maxSize, isThumbnail),
    [resize, viewportInfo, actualSize, maxSize, isThumbnail]
  );
  const [visibility, setVisibility] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  }, [img]);

  useEffect(() => {
    if (!visibility) return;
    if (!page) return;

    const width = size.width;
    const height = size.height;
    if (width * height === 0) return;

    page.render({
      width,
      height,
      scale,
    });

    return () => {
      page.render.unsubscribe();
    };
  }, [visibility, page, size, scale]);

  useEffect(() => {
    if (!visibility) return;
    if (!pdf) return;

    const width = size.width;
    const height = size.height;
    const key = `${width}:${height}:${scale}`;
    const { page, release } = pdf.page(pageNum, key);

    setPage(page);

    return () => {
      release();
      setPage(null);
    };
  }, [visibility, pdf, pageNum, size, scale]);

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
        img={img}
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
