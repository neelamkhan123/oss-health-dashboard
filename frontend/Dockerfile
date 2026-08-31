# Build the SPA, then serve it from nginx with the API proxied at /api so
# the whole app answers on one origin. See nginx.conf for why that matters.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Relative, not absolute: nginx proxies /api to the api Service in-cluster,
# so the built bundle never needs to know the deployment's hostname — which
# is what lets the same image run against an IP that changes every deploy.
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/10-cluster-resolver.sh /docker-entrypoint.d/10-cluster-resolver.sh
EXPOSE 8080
