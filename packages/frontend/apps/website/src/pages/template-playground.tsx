import Head from 'next/head';

const templates = [
    {
        id: 'kanban',
        title: 'Kanban Board',
        description: 'Visualize your workflow and manage tasks efficiently with a classic Kanban board.',
        demoId: 'demo-kanban',
    },
    {
        id: 'mindmap',
        title: 'Mind Map',
        description: 'Brainstorm ideas and organize your thoughts visually with an interactive mind map.',
        demoId: 'demo-mindmap',
    },
    {
        id: 'planner',
        title: 'Notes / Planner',
        description: 'Keep track of your daily tasks, meeting notes, and plans in one structured place.',
        demoId: 'demo-planner',
    },
];

export default function TemplatePlayground() {
    return (
        <div style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <Head>
                <title>Template Playground - AFFiNE</title>
                <meta name="description" content="Try AFFiNE templates instantly." />
            </Head>

            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#111' }}>Template Playground</h1>
                <p style={{ fontSize: '1.1rem', color: '#666', maxWidth: '600px', margin: '0 auto' }}>
                    Explore common AFFiNE templates. Click "Try Live" to open a read-only demo in a new tab.
                </p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '2rem'
            }}>
                {templates.map((template) => (
                    <div key={template.id} style={{
                        backgroundColor: '#fff',
                        borderRadius: '12px',
                        padding: '2rem',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                        border: '1px solid #eaeaea',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}>
                        <div>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', marginTop: 0 }}>{template.title}</h3>
                            <p style={{ color: '#555', lineHeight: '1.6', marginBottom: '2rem' }}>{template.description}</p>
                        </div>
                        <a
                            href={`https://app.affine.pro/workspace/demo/doc/${template.demoId}?readonly=true`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'inline-block',
                                width: '100%',
                                padding: '0.8rem',
                                backgroundColor: '#1e88e5',
                                color: '#fff',
                                textAlign: 'center',
                                borderRadius: '8px',
                                fontWeight: 600,
                                transition: 'background-color 0.2s',
                                textDecoration: 'none',
                            }}
                        >
                            Try Live
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
}
