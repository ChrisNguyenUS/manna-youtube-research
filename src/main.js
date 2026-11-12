// Entry point: `npm start`, the macOS launcher (scripts/make-app.sh) and, later, Electron start here.
import { createApp } from './app.js';
import { createHttpServer } from './http/server.js';

const app = createApp();
const srv = createHttpServer(app);
// Only the process that owns the port runs jobs: a second `npm start` must not touch the first one's jobs.
srv.on('error', (e) => {
  console.error(/** @type {any} */ (e).code === 'EADDRINUSE' ? `Cổng ${app.config.port} đang được dùng (app đã chạy?).` : e);
  process.exit(1);
});
srv.listen(app.config.port, app.config.host, () => {
  app.runner.start();
  console.log(`Content Research → http://localhost:${/** @type {any} */ (srv.address()).port}`);
});

const shutdown = async () => {
  setTimeout(() => process.exit(0), 2000).unref(); // hard cap if the browser or a socket hangs
  app.runner.stop();
  await app.close().catch(() => {}); // close Chromium before exiting
  srv.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
