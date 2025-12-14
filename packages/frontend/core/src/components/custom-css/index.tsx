import { DefaultServerService } from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useRef } from 'react';

export const CustomCssInjector = () => {
  const defaultServerService = useService(DefaultServerService);
  const config = useLiveData(defaultServerService.server?.config$);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const customCss = config?.customCss;

    // Remove existing style element
    if (styleRef.current) {
      styleRef.current.remove();
      styleRef.current = null;
    }

    // Inject new CSS if provided
    if (customCss?.trim()) {
      const styleElement = document.createElement('style');
      styleElement.setAttribute('data-affine-custom-css', 'true');
      styleElement.textContent = customCss;
      document.head.appendChild(styleElement);
      styleRef.current = styleElement;
    }

    return () => {
      styleRef.current?.remove();
      styleRef.current = null;
    };
  }, [config?.customCss]);

  return null;
};
