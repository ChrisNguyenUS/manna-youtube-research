// Entry point (renamed to src/main.js in the next step of the refactor plan).
import { createApp } from './app.js';
import { createHttpServer } from './http/server.js';

const app = createApp();
app.runner.start();
const srv = createHttpServer(app);
srv.listen(app.config.port, app.config.host, () => console.log(`YouTube Research → http://localhost:${/** @type {any} */ (srv.address()).port}`));
