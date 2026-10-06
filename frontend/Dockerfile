FROM node:26-alpine AS build

# vite inlines these at build time, so they must be available before `npm run build`
ARG VITE_API_URL=http://localhost:8000
ARG VITE_WS_URL=ws://localhost:8000/ws/telemetry
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine

WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

EXPOSE 5173

# -s = single-page fallback (unknown paths serve index.html); sw.js / workbox / manifest are plain
# static files in dist/ so the PWA service worker is served as-is
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:5173/ || exit 1

CMD ["serve", "-s", "dist", "-l", "5173"]
