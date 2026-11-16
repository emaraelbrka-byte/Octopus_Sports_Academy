const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { loadUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const { router: publicRoutes } = require('./routes/public');
const coachRoutes = require('./routes/coach');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const { purgeOldMessages } = require('./services/chat');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind a load balancer / reverse proxy
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

// Static frontend. Assets are cacheable; index.html is revalidated on every load.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    // No caching in development so code changes show up on reload
    maxAge: config.env === 'production' ? '1h' : 0,
    setHeaders: (res, file) => {
      if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// API answers are personal and change often: never let a browser or service worker cache them
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', coachRoutes);
app.use('/api', adminRoutes);
app.use('/api', chatRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: never leak stack traces to clients
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  // Database errors caused by bad input: answer with a plain message, never the database text
  if (err.code === '22P02') return res.status(404).json({ error: 'Not found' });              // invalid id format
  if (err.code === '23503') return res.status(404).json({ error: 'A related item was not found' }); // foreign key
  if (err.code === '23505') return res.status(409).json({ error: 'This already exists' });      // unique
  if (err.code === '23514') return res.status(400).json({ error: 'Some values are not allowed' }); // check
  console.error('[error]', err);
  // In development, return the real error message so problems are visible in the browser
  const detail = config.env === 'production' ? undefined : err.message;
  res.status(500).json({ error: 'Something went wrong. Please try again.', detail });
});

// Remove expired chat messages every hour (also cleaned on each chat read)
const purgeTimer = setInterval(() => {
  purgeOldMessages().catch((err) => console.error('[chat purge]', err.message));
}, 60 * 60 * 1000);
purgeTimer.unref();

app.listen(config.port, () => {
  console.log(`Octopus Sports Academy running on http://localhost:${config.port}`);
});
