import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const server = createServer();
const sendersWs = new WebSocketServer({ noServer: true });
const receiversWs = new WebSocketServer({ noServer: true });

let receiverSockets: WebSocket[] = [];

sendersWs.on('connection', (ws) => {
  ws.on('message', (message) => {
    receiverSockets.forEach((receiverWs) => {
      receiverWs.send(message.toString());
    });
  });
});

receiversWs.on('connection', (ws) => {
  receiverSockets.push(ws);
  ws.on('close', () => {
    receiverSockets = receiverSockets.filter((socket) => socket !== ws);
  });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/senders') {
    sendersWs.handleUpgrade(request, socket, head, (ws) => {
      sendersWs.emit('connection', ws, request);
    });
  } else if (request.url === '/receivers') {
    receiversWs.handleUpgrade(request, socket, head, (ws) => {
      receiversWs.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

export function startWebsocketServer() {
  server.listen(3001);
}
