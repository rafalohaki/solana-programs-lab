# Backend: Hono on Bun. Context is the repo root (needs actions/ + workspaces).
FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lock ./
COPY actions ./actions
COPY backend ./backend
RUN bun install --frozen-lockfile
WORKDIR /app/backend
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["bun", "src/index.ts"]
