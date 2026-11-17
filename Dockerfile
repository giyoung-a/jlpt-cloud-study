FROM node:24-bookworm-slim

RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources && apt-get update \
    && apt-get install -y --no-install-recommends \
       open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY *.cjs *.html mock-voice.ps1 questions.json study-*.json translations.json ./
USER node
ENV NODE_ENV=production
CMD ["node", "server.cjs"]
