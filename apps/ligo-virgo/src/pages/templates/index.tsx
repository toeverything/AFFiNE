import { styled, ListButton } from '@toeverything/components/ui';
import { TemplateData } from './template-data';
import { useParams } from 'react-router-dom';
import { AffineEditor } from '@toeverything/components/affine-editor';
const TemplatesContainer = styled('div')({
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#fff',
    border: '1px solid #E2E7ED',
    borderRadius: '5px',
    margin: '0 auto',
    '.sidebar': {
        width: '240px',
        display: 'flex',
        borderRight: '1px solid #E2E7ED',
        flexDirection: 'column',
        color: 'rgba(55, 53, 47, 0.65)',
        background: 'rgb(247, 246, 243)',
        padding: '12px',
    },
    '.preview-template': {
        display: 'flex',
    },
    '.sidebar-title': {
        borderBottom: '1px solid #E2E7ED',
    },
    '.sidebar-template-type': {
        height: '600px',
        overflowY: 'scroll',
        ul: {},
        'ul li': {
            paddingLeft: '10px',
            height: '32px',
            lineHeight: '32px',
            listStyle: 'none',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            '&:hover': {
                background: '#eee',
            },
        },
    },
    '.btn-use-this-template': {
        background: '#eee',
        color: '#fff',
        ':hover': {
            background: '#ccc',
        },
    },
});

interface ITemplateProps {
    handleClickUseThisTemplate?: () => void;
}
function Templates(props: ITemplateProps) {
    const handle_click_use_this_template = () => {
        props.handleClickUseThisTemplate();
    };
    const { workspace_id, page_id } = useParams();
    return (
        <TemplatesContainer>
            <div className="sidebar">
                <div className="sidebar-title">
                    <ListButton
                        className="btn-use-this-template"
                        content="Use this template"
                        onClick={handle_click_use_this_template}
                    />
                </div>
                <div className="sidebar-template-type">
                    {TemplateData.map((item, index) => {
                        return (
                            <div key={index}>
                                {item.name}
                                <ul>
                                    {item.subList.map((item, index) => {
                                        return <li key={index}>{item.name}</li>;
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="preview-template">
                {page_id && (
                    <AffineEditor
                        workspace={workspace_id}
                        rootBlockId={page_id}
                    />
                )}
            </div>
        </TemplatesContainer>
    );
}

export { Templates };
