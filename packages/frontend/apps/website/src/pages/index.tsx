import Link from 'next/link';

export default function Home() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh',
            padding: '0 20px',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif'
        }}>
            <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#333' }}>Welcome to AFFiNE</h1>
            <p style={{ fontSize: '1.2rem', color: '#666', maxWidth: '600px', marginBottom: '2rem', lineHeight: '1.5' }}>
                The Next-Gen Knowledge Base to bring you together.
            </p>
            <Link href="/template-playground" style={{
                padding: '12px 24px',
                backgroundColor: '#1e88e5',
                color: 'white',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '1.1rem',
                fontWeight: '500',
                transition: 'background-color 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                Check out Templates
            </Link>
        </div>
    );
}
