export function linkIframe(
  iframe: HTMLIFrameElement,
  html: string,
  id: string
) {
  // force reload iframe
  iframe.src = '';
  iframe.src = 'https://affine.run/static/container.html';
  iframe.sandbox.add(
    'allow-pointer-lock',
    'allow-popups',
    'allow-forms',
    'allow-popups-to-escape-sandbox',
    'allow-downloads',
    'allow-scripts',
    'allow-same-origin'
  );
  iframe.onload = () => {
    const injectedHtml = injectIframeHeightScript(html, id);
    iframe.contentWindow?.postMessage(injectedHtml, 'https://affine.run');
  };
}

function injectIframeHeightScript(html: string, id: string): string {
  const heightScript = `
    <script>
      function sendIframeHeight() {
        const height = document.documentElement.scrollHeight;
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'iframe-height',
            id: '${id}',
            height: height
          }, '*');
        }
      }
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sendIframeHeight);
      } else {
        sendIframeHeight();
      }
      
      window.addEventListener('load', () => setTimeout(sendIframeHeight, 100));
      
      if (window.ResizeObserver) {
        new ResizeObserver(sendIframeHeight).observe(document.body);
      }
    </script>
  `;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${heightScript}\n</body>`);
  } else if (html.includes('</html>')) {
    return html.replace('</html>', `${heightScript}\n</html>`);
  } else {
    return html + heightScript;
  }
}
