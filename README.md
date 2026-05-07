# Angular WebSocket Chat

A realtime chat application built with Angular 21 and a small Node.js WebSocket server.

## Requirements

- Node.js compatible with Angular 21
- npm

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Angular dev server and WebSocket server together:

```bash
npm run dev
```

Open `http://localhost:4200/`.

The Angular app connects to `ws://localhost:8080`. Open the app in multiple browser windows to test realtime broadcast messages.

## Scripts

- `npm run dev` starts both servers.
- `npm start` starts only the Angular dev server.
- `npm run server` starts only the WebSocket server.
- `npm run build` creates a production Angular build.
- `npm test -- --watch=false` runs the unit tests once.
