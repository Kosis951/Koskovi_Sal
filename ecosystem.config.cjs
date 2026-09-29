// PM2 configuration: `pm2 start ecosystem.config.cjs` (after `npm ci` and
// `npm run build`). Environment variables are read from .env.local by Next.js.
module.exports = {
  apps: [
    {
      name: "koskovi-sal",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
