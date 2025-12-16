import Link from 'next/link';

export default function Navbar() {
    const navStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #eaeaea',
    };

    const linkStyle = {
        marginRight: '1.5rem',
        fontWeight: 500,
        fontSize: '0.95rem',
        cursor: 'pointer',
    };

    const brandStyle = {
        fontWeight: 700,
        fontSize: '1.2rem',
        marginRight: '2rem',
    };

    return (
        <nav style={navStyle}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <Link href="/" style={brandStyle}>AFFiNE</Link>
                <Link href="/template-playground" style={linkStyle}>Templates</Link>
            </div>
            <div>
                <a href="https://affine.pro" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, color: '#1e88e5' }}>
                    Go to Main Site
                </a>
            </div>
        </nav>
    );
}
