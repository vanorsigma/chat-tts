import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const server = createServer();
const sendersWs = new WebSocketServer({ noServer: true });
const receiversWs = new WebSocketServer({ noServer: true });

let receiverSockets: WebSocket[] = [];

sendersWs.on('connection', (ws) => {
  console.log('Sender connected to the bus.');
  ws.on('message', (message) => {
    console.log(`=> ${message}`);
    receiverSockets.forEach((receiverWs) => {
      receiverWs.send(message.toString());
    });
  });
  ws.on('close', () => {
    console.log('Sender disconnected from the bus.');
  });
});

receiversWs.on('connection', (ws) => {
  console.log('Receiver connected to the bus.');
  receiverSockets.push(ws);
  ws.on('close', () => {
    receiverSockets = receiverSockets.filter((socket) => socket !== ws);
    console.log('Receiver disconnected from the bus.');
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
    console.warn(`Unknown WebSocket upgrade path: ${request.url}`);
    socket.destroy();
  }
});

export function startWebsocketServer() {
  console.log("Starting WebSocket server at localhost:3001");
  server.listen(3001);
}
