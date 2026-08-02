FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4174

COPY package*.json ./
RUN npm ci --omit=dev

COPY config ./config
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data/images

EXPOSE 4174

CMD ["npm", "run", "serve"]
