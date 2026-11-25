# The web (Next.js) with its SQLite database outside the image (/data), as
# it runs on the NAS (nas/web). Built by .github/workflows/web-image.yml.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Dev dependencies stay: `next start` reads next.config.ts.
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/data/koskovi.sqlite \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/auth/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start"]
