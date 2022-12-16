import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { EditorProvider } from '@/providers/editor-provider';
import { ModalProvider } from '@/providers/global-modal-provider';
import { AppStateProvider } from '@/providers/app-state-provider';
import { Logger } from '@toeverything/pathfinder-logger';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import '@fontsource/space-mono';
import '@fontsource/poppins';
import '../utils/print-build-info';
import { styled } from '@/styles';
import ProviderComposer from '@/components/provider-composer';
import ConfirmProvider from '@/providers/confirm-provider';
const ThemeProvider = dynamic(() => import('@/providers/themeProvider'), {
  ssr: false,
});

const StyledPage = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    backgroundColor: theme.colors.pageBackground,
    transition: 'background-color .5s',
    display: 'flex',
    flexGrow: '1',
  };
});

const StyledWrapper = styled('div')(({ theme }) => {
  return {
    flexGrow: 1,
    position: 'relative',
  };
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Logger />
      <ProviderComposer
        contexts={[
          <EditorProvider key="EditorProvider" />,
          <ThemeProvider key="ThemeProvider" />,
          <ModalProvider key="ModalProvider" />,
          <ConfirmProvider key="ConfirmProvider" />,
          <AppStateProvider key="appStateProvider" />,
        ]}
      >
        <StyledPage>
          <WorkSpaceSliderBar />
          <StyledWrapper>
            <Component {...pageProps} />
          </StyledWrapper>
        </StyledPage>
      </ProviderComposer>
    </>
  );
}

export default MyApp;
