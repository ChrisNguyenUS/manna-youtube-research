// Entry point: `npm start`, the macOS launcher (scripts/make-app.sh) and, later, Electron start here.
import { createApp } from './app.js';
import { createHttpServer } from './http/server.js';

const app = createApp();
app.runner.start();
const srv = createHttpServer(app);
srv.listen(app.config.port, app.config.host, () => console.log(`YouTube Research → http://localhost:${/** @type {any} */ (srv.address()).port}`));

const shutdown = () => {
  app.runner.stop();
  srv.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
