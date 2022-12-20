import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { ModalProvider } from '@/providers/global-modal-provider';
import { AppStateProvider } from '@/providers/app-state-provider/provider';
import { Logger } from '@toeverything/pathfinder-logger';
import { WorkSpaceSliderBar } from '@/components/workspace-slider-bar';
import '@fontsource/space-mono';
import '@fontsource/poppins';
import '../utils/print-build-info';
import { styled } from '@/styles';
import ProviderComposer from '@/components/provider-composer';
import ConfirmProvider from '@/providers/confirm-provider';
import HelpIsland from '@/components/help-island';
import { useRouter } from 'next/router';

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
  const router = useRouter();

  return (
    <>
      <Logger />
      <ProviderComposer
        contexts={[
          <AppStateProvider key="appStateProvider" />,
          <ThemeProvider key="ThemeProvider" />,
          <ModalProvider key="ModalProvider" />,
          <ConfirmProvider key="ConfirmProvider" />,
        ]}
      >
        <StyledPage>
          <WorkSpaceSliderBar />
          <StyledWrapper>
            <Component {...pageProps} />
            <HelpIsland
              showList={router.pathname !== '/' ? ['contact'] : undefined}
            />
          </StyledWrapper>
        </StyledPage>
      </ProviderComposer>
    </>
  );
}

export default MyApp;
