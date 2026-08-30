import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env.js';
import { requireAuth } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { stacksRouter } from './routes/stacks.js';
import { notebooksRouter } from './routes/notebooks.js';
import { notesRouter } from './routes/notes.js';
import { syncRouter } from './routes/sync.js';
import { attachmentsRouter } from './routes/attachments.js';
import { importRouter } from './routes/import.js';
import { activityRouter } from './routes/activity.js';
import { ensureContainer } from './storage/blob.js';

const app = express();

// App Service terminates TLS and proxies; without this req.ip is the proxy's
// address and every caller would share one rate-limit bucket.
app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  }),
);
app.use(cookieParser());
// JSON for most routes; raw text for ENEX uploads (can be large XML).
app.use('/api/import', express.text({ type: ['application/xml', 'text/xml'], limit: '200mb' }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

// Everything below requires authentication.
app.use('/api/stacks', requireAuth, stacksRouter);
app.use('/api/notebooks', requireAuth, notebooksRouter);
app.use('/api/notes', requireAuth, notesRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/attachments', requireAuth, attachmentsRouter);
app.use('/api/import', requireAuth, importRouter);
app.use('/api/activity', requireAuth, activityRouter);

// Fallback error handler.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

async function start() {
  await ensureContainer();
  app.listen(env.PORT, () => {
    console.log(`Sthir API listening on http://localhost:${env.PORT}`);
  });
}

void start();
