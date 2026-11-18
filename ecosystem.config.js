// PM2 settings: keeps the site running and uses every CPU core.
//   npm run pm2:start    start (or restart) the site in the background
//   npm run pm2:reload   reload after a code change, one process at a time (no downtime)
//   npm run pm2:logs     watch the logs
//   npm run pm2:status   see the processes, memory and restarts
//   npm run pm2:stop     stop the site
module.exports = {
  apps: [
    {
      name: 'octopus',
      script: 'src/server.js',
      // One process per CPU core; requests are shared between them
      exec_mode: 'cluster',
      instances: process.env.PM2_INSTANCES || 'max',
      // If a process crashes it is started again at once; a process stuck above 500 MB is recycled
      autorestart: true,
      max_memory_restart: '500M',
      // Crashing again and again right after start (e.g. database down): wait a little longer each time
      exp_backoff_restart_delay: 200,
      // Matches the 10 s graceful shutdown in server.js, so requests in progress can finish
      kill_timeout: 11000,
      // Windows has no SIGINT/SIGTERM for PM2 to send, so ask the process to shut down by message instead
      shutdown_with_message: process.platform === 'win32',
      listen_timeout: 10000,
      time: true, // timestamps in the logs
      // NODE_ENV and the other settings come from .env (loaded by src/config.js)
    },
  ],
};
