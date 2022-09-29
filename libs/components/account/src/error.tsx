import style9 from 'style9';

import { keyframes, MuiBox as Box } from '@toeverything/components/ui';

const styles = style9.create({
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: 'calc( 100vh - 64px )',
    },
});

type ErrorProps = {
    title?: string;
    subTitle?: string;
    action1Text?: string;
    action1Route?: string;
    action2Text?: string;
    action2Route?: string;
    clearOnClick?: boolean;
};

const floatAnimation = keyframes`
100% { transform: translateY(20px) }
`;

/**
 * Exception related pages
 */
export function Error({
    title = 'Page Not Found',
    subTitle,
    action1Text,
    action1Route,
    action2Text,
    action2Route,
    clearOnClick = false,
}: ErrorProps) {
    return (
        <Box
            sx={{
                height: '100vh',
                backgroundColor: '#2F3242',
                position: 'relative',
                '& svg': {
                    position: 'absolute',
                    top: '50%',
                    left: '45%',
                    marginTop: '-250px',
                    marginLeft: '-400px',
                },
                '& .message-box': {
                    height: '200px',
                    minWidth: '380px',
                    position: 'absolute',
                    top: '50%',
                    left: '45%',
                    marginTop: '-100px',
                    marginLeft: '0',
                    color: '#FFF',
                    // font-family: Roboto;
                    // font-weight: 300;
                },
                '& .message-box h1': {
                    fontSize: '60px',
                    lineHeight: '46px',
                    marginBottom: '40px',
                    color: '#FFF',
                },
                '& .message-box h3': {
                    fontSize: '32px',
                    fontWeight: 400,
                    lineHeight: '32px',
                    color: '#FFF',
                },
                '& .buttons-con .action-link-wrap': {
                    marginTop: '40px',
                },
                '& .buttons-con .action-link-wrap a': {
                    backgroundColor: '#3E6FDB',
                    padding: ' 8px 25px',
                    borderRadius: '4px',
                    color: '#FFF',
                    fontWeight: 'bold',
                    // font-size: 14px;
                    transition: 'all 0.3s linear',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    marginRight: '10px',
                },
                '& .buttons-con .action-link-wrap a:hover': {
                    backgroundColor: '#5A5C6C',
                    color: '#fff',
                },
                '& #Polygon-1': {
                    animation: 'float 1s infinite ease-in-out alternate',
                },
                '& #Polygon-2': {
                    animation: `${floatAnimation} 1s infinite ease-in-out alternate`,
                    animationDelay: '0.2s',
                },
                '& #Polygon-3': {
                    animation: `${floatAnimation} 1s infinite ease-in-out alternate`,
                    animationDelay: '0.4s',
                },
                '& #Polygon-4': {
                    animation: `${floatAnimation} 1s infinite ease-in-out alternate`,
                    animationDelay: '0.6s',
                },
                '& #Polygon-5': {
                    animation: `${floatAnimation} 1s infinite ease-in-out alternate`,
                    animationDelay: '0.8s',
                },
            }}
        >
            <div className="root">
                <svg
                    width="380px"
                    height="500px"
                    viewBox="0 0 837 1045"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g
                        id="Page-1"
                        stroke="none"
                        strokeWidth="1"
                        fill="none"
                        fillRule="evenodd"
                        // sketch:type="MSPage"
                    >
                        <path
                            d="M353,9 L626.664028,170 L626.664028,487 L353,642 L79.3359724,487 L79.3359724,170 L353,9 Z"
                            id="Polygon-1"
                            stroke="#007FB2"
                            strokeWidth="6"
                            // sketch:type="MSShapeGroup"
                        />
                        <path
                            d="M78.5,529 L147,569.186414 L147,648.311216 L78.5,687 L10,648.311216 L10,569.186414 L78.5,529 Z"
                            id="Polygon-2"
                            stroke="#EF4A5B"
                            strokeWidth="6"
                            // sketch:type="MSShapeGroup"
                        />
                        <path
                            d="M773,186 L827,217.538705 L827,279.636651 L773,310 L719,279.636651 L719,217.538705 L773,186 Z"
                            id="Polygon-3"
                            stroke="#795D9C"
                            strokeWidth="6"
                            // sketch:type="MSShapeGroup"
                        />
                        <path
                            d="M639,529 L773,607.846761 L773,763.091627 L639,839 L505,763.091627 L505,607.846761 L639,529 Z"
                            id="Polygon-4"
                            stroke="#F2773F"
                            strokeWidth="6"
                            // sketch:type="MSShapeGroup"
                        />
                        <path
                            d="M281,801 L383,861.025276 L383,979.21169 L281,1037 L179,979.21169 L179,861.025276 L281,801 Z"
                            id="Polygon-5"
                            stroke="#36B455"
                            strokeWidth="6"
                            // sketch:type="MSShapeGroup"
                        />
                    </g>
                </svg>
                <div className="message-box">
                    <h1>{title}</h1>
                    {subTitle ? <h3>{subTitle}</h3> : null}
                    <div className="buttons-con">
                        <div className="action-link-wrap">
                            {/* {action1Text ? (
                                <Link
                                    to={action1Route || '/login'}
                                    className="link-button link-back-button"
                                    onClick={event => {
                                        if (clearOnClick) {
                                            event.preventDefault();
                                            LOGOUT_LOCAL_STORAGE.forEach(name =>
                                                localStorage.removeItem(name)
                                            );
                                            document.cookie =
                                                LOGOUT_COOKIES.map(
                                                    name =>
                                                        name +
                                                        '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
                                                ).join(' ');

                                            signOut(getAuth());

                                            window.location.href =
                                                action1Route || '/login';
                                        }
                                    }}
                                >
                                    {action1Text}
                                </Link>
                            ) : null} */}
                            {/* {action2Text ? (
                                <Link
                                    to={action2Route || '/login'}
                                    className="link-button link-back-button"
                                >
                                    {action2Text}
                                </Link>
                            ) : null} */}
                        </div>
                    </div>
                </div>
            </div>
        </Box>
    );
}
