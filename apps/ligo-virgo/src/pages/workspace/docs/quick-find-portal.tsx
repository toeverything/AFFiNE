import { styled } from '@toeverything/components/ui';

import SearchIcon from '@mui/icons-material/Search';

const handle_search = () => {
    //@ts-ignore
    virgo.plugins.plugins['search'].renderSearch();
};
const QuickFindPortalContainer = styled('div')({
    position: 'relative',
    marginLeft: '10px',
    height: '22px',
    lineHeight: '22px',
    width: '220px',
    borderRadius: '8px',
    color: '#4c6275',
    fontSize: '14px',
    paddingLeft: '20px',
    cursor: 'pointer',
    ':hover': {
        backgroundColor: '#ccc',
    },
    '.shortcutIcon': {
        position: 'absolute',
        top: '3px',
        left: '0px',
        fontSize: '16px!important',
    },
});

function QuickFindPortal() {
    return (
        <QuickFindPortalContainer onClick={handle_search}>
            <SearchIcon className="shortcutIcon" /> Quick Find
        </QuickFindPortalContainer>
    );
}

export default QuickFindPortal;
