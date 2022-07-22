import WebSocket = require('ws');
import http = require('http');

// import authing = require('authing-js-sdk');
import firebaseApp = require('firebase-admin/app');
import firebaseAuth = require('firebase-admin/auth');
import LRUCache = require('lru-cache');
import nanoid = require('nanoid');

import { handleConnection } from './utils';
import { URL } from 'url';

if (process.env.NODE_ENV !== 'development') {
    firebaseApp.initializeApp({
        credential: firebaseApp.cert({
            clientEmail: process.env.FIREBASE_ACCOUNT,
            privateKey: process.env.FIREBASE_CERT,
            projectId: process.env.FIREBASE_PROJECT,
        }),
        projectId: process.env.FIREBASE_PROJECT,
    });
}

const _getWorkspace = (path: string) => {
    const [_, part1] = path.split('/collaboration/');
    const [workspace] = part1?.split('/') || [];
    return workspace;
};

const AFFINE_COMMON_WORKSPACE = 'affine2vin277tcmafwq';

const _checkAuth = async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    callback: (response: http.OutgoingMessage, workspace: string) => boolean
) => {
    if (process.env.NODE_ENV === 'development') {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const workspace = _getWorkspace(url.pathname);
        if (workspace) return callback(response, workspace);
        return false;
    } else {
        try {
            const decodedToken = await firebaseAuth
                .getAuth()
                .verifyIdToken(request.headers.token as string);
            const allowWorkspace = [AFFINE_COMMON_WORKSPACE, decodedToken.uid];
            const url = new URL(request.url, `http://${request.headers.host}`);
            const workspace = _getWorkspace(url.pathname);
            if (allowWorkspace.includes(workspace)) {
                return callback(response, workspace);
            }
        } catch (error) {
            console.log(error);
        }
        return false;
    }
};

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 3000;

const _tokens = new LRUCache<string, string>({
    max: 10240,
    ttl: 1000 * 60 * 5,
});

const _server = http.createServer((request, response) => {
    if (
        request.method === 'POST' &&
        typeof request.headers.token === 'string'
    ) {
        _checkAuth(request, response, (response, workspace) => {
            const protocol = nanoid.nanoid(16);
            _tokens.set(protocol, workspace);
            response.end(JSON.stringify({ protocol }));
            return true;
        })
            .then(responded => {
                if (!responded) {
                    response.writeHead(401).end();
                }
            })
            .catch(error => {
                console.log(error);
                response.writeHead(401).end();
            });
        return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('okay');
});

const _websocketServer = new WebSocket.Server({ noServer: true });
_websocketServer.on('connection', handleConnection);

_server.on('upgrade', (request, socket, head) => {
    // You may check auth of request here..
    // See https://github.com/websockets/ws#client-authentication
    const protocol = request.headers['sec-websocket-protocol'];
    if (typeof protocol === 'string' && _tokens.get(protocol)) {
        _websocketServer.handleUpgrade(request, socket, head, ws => {
            _websocketServer.emit(
                'connection',
                ws,
                request,
                _tokens.get(protocol)
            );
        });
    } else {
        socket.write('HTTP/1.1 401 Unauthorized');
        socket.destroy();
    }
});

_server.listen(PORT, () => {
    console.log(`running at '${HOST}' on port ${PORT}`);
});
