/* eslint-disable filename-rules/match */
import { useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { Error } from './../error';
import {
    GoogleAuthProvider,
    getAuth,
    signInWithPopup,
    browserLocalPersistence,
} from 'firebase/auth';

import { LogoImg } from '@toeverything/components/common';
import {
    MuiButton,
    MuiBox,
    MuiTypography,
    MuiContainer,
    MuiGrid,
} from '@toeverything/components/ui';

const _firebaseConfig = {
    apiKey: 'AIzaSyD7A_VyGaKTXsPqtga9IbwrEsbWWc4rH3Y',
    authDomain: 'login.affine.pro',
    projectId: 'affine-346417',
    storageBucket: 'affine-346417.appspot.com',
    messagingSenderId: '690608236388',
    appId: '1:690608236388:web:ccc7ee97b59a4cf2677c71',
};

const _app = initializeApp(_firebaseConfig);

const GoogleIcon = () => (
    <svg width="24px" height="24px" viewBox="0 0 118 120">
        <g
            id="Page-1"
            stroke="none"
            stroke-width="1"
            fill="none"
            fill-rule="evenodd"
        >
            <g id="Artboard-1" transform="translate(-332.000000, -639.000000)">
                <g
                    id="google_buttn"
                    transform="translate(332.000000, 639.000000)"
                >
                    <g id="logo_googleg_48dp">
                        <path
                            d="M117.6,61.3636364 C117.6,57.1090909 117.218182,53.0181818 116.509091,49.0909091 L60,49.0909091 L60,72.3 L92.2909091,72.3 C90.9,79.8 86.6727273,86.1545455 80.3181818,90.4090909 L80.3181818,105.463636 L99.7090909,105.463636 C111.054545,95.0181818 117.6,79.6363636 117.6,61.3636364 L117.6,61.3636364 Z"
                            id="Shape"
                            fill="#4285F4"
                        />
                        <path
                            d="M60,120 C76.2,120 89.7818182,114.627273 99.7090909,105.463636 L80.3181818,90.4090909 C74.9454545,94.0090909 68.0727273,96.1363636 60,96.1363636 C44.3727273,96.1363636 31.1454545,85.5818182 26.4272727,71.4 L6.38181818,71.4 L6.38181818,86.9454545 C16.2545455,106.554545 36.5454545,120 60,120 L60,120 Z"
                            id="Shape"
                            fill="#34A853"
                        />
                        <path
                            d="M26.4272727,71.4 C25.2272727,67.8 24.5454545,63.9545455 24.5454545,60 C24.5454545,56.0454545 25.2272727,52.2 26.4272727,48.6 L26.4272727,33.0545455 L6.38181818,33.0545455 C2.31818182,41.1545455 0,50.3181818 0,60 C0,69.6818182 2.31818182,78.8454545 6.38181818,86.9454545 L26.4272727,71.4 L26.4272727,71.4 Z"
                            id="Shape"
                            fill="#FBBC05"
                        />
                        <path
                            d="M60,23.8636364 C68.8090909,23.8636364 76.7181818,26.8909091 82.9363636,32.8363636 L100.145455,15.6272727 C89.7545455,5.94545455 76.1727273,0 60,0 C36.5454545,0 16.2545455,13.4454545 6.38181818,33.0545455 L26.4272727,48.6 C31.1454545,34.4181818 44.3727273,23.8636364 60,23.8636364 L60,23.8636364 Z"
                            id="Shape"
                            fill="#EA4335"
                        />
                        <path
                            d="M0,0 L120,0 L120,120 L0,120 L0,0 Z"
                            id="Shape"
                        />
                    </g>
                </g>
            </g>
        </g>
    </svg>
);

export const Firebase = () => {
    const [auth, provider] = useMemo(() => {
        const auth = getAuth(_app);
        auth.setPersistence(browserLocalPersistence);
        const provider = new GoogleAuthProvider();
        return [auth, provider];
    }, []);

    const handleAuth = useCallback(() => {
        signInWithPopup(auth, provider).catch(error => {
            const errorCode = error.code;
            const errorMessage = error.message;
            const email = error.customData.email;
            const credential = GoogleAuthProvider.credentialFromError(error);
            console.log(errorCode, errorMessage, email, credential);
        });
    }, [auth, provider]);

    return (
        <MuiGrid container>
            <MuiGrid item xs={8}>
                <Error
                    title="Welcome to Affine"
                    subTitle="blocks of knowledge to power your team"
                    action1Text="Login &nbsp; or &nbsp; Register"
                />
            </MuiGrid>

            <MuiGrid item xs={4}>
                <MuiBox
                    onSubmit={handleAuth}
                    onClick={handleAuth}
                    style={{
                        textAlign: 'center',
                        width: '300px',
                        margin: '300px  auto 20px auto',
                    }}
                    sx={{ mt: 1 }}
                >
                    <LogoImg
                        style={{
                            width: '100px',
                        }}
                    />

                    <MuiButton
                        variant="outlined"
                        fullWidth
                        style={{ textTransform: 'none' }}
                        startIcon={<GoogleIcon />}
                    >
                        Continue with Google
                    </MuiButton>
                </MuiBox>
            </MuiGrid>
        </MuiGrid>
    );
};
