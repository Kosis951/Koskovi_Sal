// PM2 configuration: `pm2 start ecosystem.config.cjs` (after `npm ci` and
// `npm run build`). Environment variables are read from .env.local by Next.js.
// The port matches the reverse proxy on the VPS; override with PORT=… if needed.
const port = process.env.PORT || "3001";

module.exports = {
  apps: [
    {
      name: "koskovi-sal",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "400M",
    },
  ],
};
