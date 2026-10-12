# Frontend: Astro standalone server (bun) + same bun runtime.
# Bun uses an isolated linker: each workspace has symlinks in
# <workspace>/node_modules pointing at the central store in
# /app/node_modules/.bun (top-level `X -> ../../node_modules/.bun/...`,
# scoped `@scope/X -> ../../../node_modules/.bun/...`). Both resolve only
# when the /app + /app/frontend tree is mirrored into the runtime stage,
# so copy both trees (never reinstall — a fresh install leaves an empty
# top-level and the COPY'd symlinks would dangle).
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY actions ./actions
COPY backend/package.json ./backend/package.json
COPY frontend ./frontend
RUN bun install --frozen-lockfile
WORKDIR /app/frontend
RUN bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app/frontend
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/frontend/node_modules ./node_modules
COPY --from=build /app/frontend/dist ./dist
COPY --from=build /app/frontend/package.json ./package.json
EXPOSE 4321
CMD ["bun", "./dist/server/entry.mjs"]
