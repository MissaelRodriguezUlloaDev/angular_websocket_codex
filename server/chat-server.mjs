import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.PORT ?? 8080);
const server = new WebSocketServer({ port });
const clients = new Map();
const maxDistinctColors = 100;
const maxConsecutiveMessages = 5;
const spamTimeoutMs = 30000;
let lastMessageClientId = '';
let consecutiveMessageCount = 0;

const createMessage = ({
  author,
  avatarUrl = '',
  colorIndex = 0,
  status = 'active',
  text,
  system = false,
}) => ({
  id: randomUUID(),
  author,
  avatarUrl,
  colorIndex,
  status,
  text,
  system,
  sentAt: new Date().toISOString(),
});

const broadcast = (event) => {
  const data = JSON.stringify(event);

  for (const client of server.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

const broadcastExcept = (excludedSocket, event) => {
  const data = JSON.stringify(event);

  for (const client of server.clients) {
    if (client !== excludedSocket && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

const broadcastPresence = () => {
  broadcast({
    type: 'presence',
    count: clients.size,
    users: [...clients.entries()].map(([socket, user]) => ({
      id: user.id,
      author: user.author,
      avatarUrl: user.avatarUrl,
      colorIndex: user.colorIndex,
      status: user.status,
    })),
  });
};

const nextColorIndex = () => {
  const usedColorIndexes = new Set([...clients.values()].map((user) => user.colorIndex));

  for (let index = 0; index < maxDistinctColors; index += 1) {
    if (!usedColorIndexes.has(index)) {
      return index;
    }
  }

  return clients.size % maxDistinctColors;
};

const sanitizeAuthor = (author) => String(author ?? 'Guest').trim().slice(0, 40) || 'Guest';
const sanitizeAvatar = (avatarUrl) => {
  const avatar = String(avatarUrl ?? '');

  return avatar.startsWith('data:image/') && avatar.length < 200000 ? avatar : '';
};
const sanitizeStatus = (status) => (status === 'away' ? 'away' : 'active');

const sendRateLimitWarning = (socket, timeoutUntil) => {
  socket.send(
    JSON.stringify({
      type: 'rate-limit',
      timeoutUntil,
      message: 'You sent 5 consecutive messages. Please wait 30 seconds before sending again.',
    }),
  );
};

server.on('connection', (socket) => {
  clients.set(socket, {
    id: randomUUID(),
    author: 'Guest',
    avatarUrl: '',
    colorIndex: nextColorIndex(),
    announced: false,
    timeoutUntil: 0,
    status: 'active',
  });

  socket.send(
    JSON.stringify({
      type: 'presence',
      count: clients.size,
      users: [...clients.values()],
    }),
  );
  socket.send(
    JSON.stringify({
      type: 'system',
      payload: createMessage({
        author: 'System',
        text: 'Connected to the chat room.',
        system: true,
      }),
    }),
  );
  broadcastPresence();

  socket.on('message', (rawData) => {
    try {
      const event = JSON.parse(rawData.toString());

      if (event.type === 'presence-update' && event.payload) {
        const currentUser = clients.get(socket);

        if (currentUser) {
          const author = sanitizeAuthor(event.payload.author);
          const shouldAnnounceJoin = !currentUser.announced;

          clients.set(socket, {
            ...currentUser,
            author,
            avatarUrl: sanitizeAvatar(event.payload.avatarUrl),
            announced: true,
            status: sanitizeStatus(event.payload.status),
          });

          if (shouldAnnounceJoin) {
            broadcastExcept(socket, {
              type: 'system',
              payload: createMessage({
                author: 'System',
                text: `${author} joined the conversation.`,
                system: true,
              }),
            });
          }

          broadcastPresence();
        }

        return;
      }

      if (event.type !== 'message' || !event.payload) {
        return;
      }

      const author = sanitizeAuthor(event.payload.author);
      const avatarUrl = sanitizeAvatar(event.payload.avatarUrl);
      const status = sanitizeStatus(event.payload.status);
      const currentUser = clients.get(socket);
      const colorIndex = currentUser?.colorIndex ?? 0;
      const text = String(event.payload.text ?? '').trim().slice(0, 1000);
      const now = Date.now();

      if (!text) {
        return;
      }

      if (currentUser?.timeoutUntil && currentUser.timeoutUntil > now) {
        sendRateLimitWarning(socket, currentUser.timeoutUntil);
        return;
      }

      if (currentUser) {
        clients.set(socket, {
          ...currentUser,
          author,
          avatarUrl,
          status,
        });
        broadcastPresence();
      }

      broadcast({
        type: 'message',
        payload: createMessage({ author, avatarUrl, colorIndex, status, text }),
      });

      if (currentUser?.id === lastMessageClientId) {
        consecutiveMessageCount += 1;
      } else {
        lastMessageClientId = currentUser?.id ?? '';
        consecutiveMessageCount = 1;
      }

      if (currentUser && consecutiveMessageCount >= maxConsecutiveMessages) {
        const timeoutUntil = now + spamTimeoutMs;

        clients.set(socket, {
          ...clients.get(socket),
          timeoutUntil,
        });
        lastMessageClientId = '';
        consecutiveMessageCount = 0;
        sendRateLimitWarning(socket, timeoutUntil);
      }
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'system',
          payload: createMessage({
            author: 'System',
            text: 'That message could not be processed.',
            system: true,
          }),
        }),
      );
    }
  });

  socket.on('close', () => {
    if (clients.get(socket)?.id === lastMessageClientId) {
      lastMessageClientId = '';
      consecutiveMessageCount = 0;
    }

    clients.delete(socket);
    broadcastPresence();
  });
});

console.log(`WebSocket chat server listening on ws://localhost:${port}`);
