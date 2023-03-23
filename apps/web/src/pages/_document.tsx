import type { EmotionJSX } from '@emotion/react/types/jsx-namespace';
import createEmotionServer from '@emotion/server/create-instance';
import type { DocumentContext } from 'next/document';
import Document, { Head, Html, Main, NextScript } from 'next/document';
import * as React from 'react';

import createEmotionCache from '../utils/create-emotion-cache';

export default class AppDocument extends Document<{
  emotionStyleTags: EmotionJSX.Element[];
}> {
  static getInitialProps = async (ctx: DocumentContext) => {
    const originalRenderPage = ctx.renderPage;

    const cache = createEmotionCache();
    const { extractCriticalToChunks } = createEmotionServer(cache);

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App: any) =>
          function EnhanceApp(props) {
            return <App emotionCache={cache} {...props} />;
          },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const emotionStyles = extractCriticalToChunks(initialProps.html);
    const emotionStyleTags = emotionStyles.styles.map(style => (
      <style
        data-emotion={`${style.key} ${style.ids.join(' ')}`}
        key={style.key}
        dangerouslySetInnerHTML={{ __html: style.css }}
      />
    ));

    return {
      ...initialProps,
      emotionStyleTags,
    };
  };
  render() {
    return (
      <Html>
        <Head>
          <meta name="theme-color" content="#fafafa" />
          <link rel="manifest" href="/manifest.json" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link rel="icon" sizes="192x192" href="/chrome-192x192.png" />
          <meta name="emotion-insertion-point" content="" />
          <meta name="viewport" content="initial-scale=1, width=device-width" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content="https://app.affine.pro/" />
          <meta
            name="twitter:title"
            content="AFFiNE：There can be more than Notion and Miro."
          />
          <meta
            name="twitter:description"
            content="There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together."
          />
          <meta name="twitter:site" content="@AffineOfficial" />
          <meta name="twitter:image" content="https://affine.pro/og.jpeg" />
          <meta
            property="og:title"
            content="AFFiNE：There can be more than Notion and Miro."
          />
          <meta property="og:type" content="website" />
          <meta
            property="og:description"
            content="There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together."
          />
          <meta property="og:url" content="https://app.affine.pro/" />
          <meta property="og:image" content="https://affine.pro/og.jpeg" />
          {this.props.emotionStyleTags}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
