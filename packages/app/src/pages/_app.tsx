import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { EditorProvider } from '@/providers/editor-provider';
import { ModalProvider } from '@/providers/global-modal-provider';
import { Logger } from '@toeverything/pathfinder-logger';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import '@fontsource/space-mono';
import '@fontsource/poppins';
import '../utils/print-build-info';
import { styled } from '@/styles';
import type { ReactNode, PropsWithChildren, FC } from 'react';
import { cloneElement } from 'react';

const ThemeProvider = dynamic(() => import('@/providers/themeProvider'), {
  ssr: false,
});

const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    display: 'flex',
  };
});

const ProviderComposer: FC<
  PropsWithChildren<{
    contexts: any;
  }>
> = ({ contexts, children }) =>
  contexts.reduceRight(
    (kids: ReactNode, parent: any) =>
      cloneElement(parent, {
        children: kids,
      }),
    children
  );

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Logger />
      <ProviderComposer
        contexts={[
          <EditorProvider key="EditorProvider" />,
          <ThemeProvider key="ThemeProvider" />,
          <ModalProvider key="ModalProvider" />,
        ]}
      >
        <StyledPage>
          <WorkSpaceSliderBar />
          <Component {...pageProps} />
        </StyledPage>
      </ProviderComposer>
    </>
  );
}

export default MyApp;
