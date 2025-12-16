import type { AppProps } from 'next/app';
import Navbar from '@/components/Navbar';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
    return (
        <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Navbar />
            <main style={{ flex: 1 }}>
                <Component {...pageProps} />
            </main>
        </div>
    );
}
