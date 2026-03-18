export interface PreviewPlugin {
  renderMermaidSvg(options: {
    code: string;
    options?: {
      theme?: string;
      fontFamily?: string;
      fontSize?: number;
    };
  }): Promise<{ svg: string }>;
  renderTypstSvg(options: {
    code: string;
    options?: {
      fontUrls?: string[];
      theme?: 'light' | 'dark';
    };
  }): Promise<{ svg: string }>;
}
