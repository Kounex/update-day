FROM node:22-slim AS base

# openssl will be a required package if base is updated to 18.16+ due to node:*-slim base distro change
# https://github.com/prisma/prisma/issues/19729#issuecomment-1591270599
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
    tini \
    openssl \
    ca-certificates \
    && apt-get autoclean \
    && apt-get autoremove \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer's own postinstall script downloads a Chrome build for every `yarn install`
# it's part of. We don't need that in the dependencies/builder stages (their filesystem
# is discarded - only dist/node_modules/prisma-client get copied into the runner stage),
# so skip it here and download for real, once, in the runner stage below.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies
FROM base AS dependencies

WORKDIR /usr/app

COPY package.json .
COPY yarn.lock .

RUN yarn install --prod
RUN cp -R node_modules /usr/app/prod_node_modules

RUN yarn install

FROM dependencies AS builder

COPY . .

RUN yarn prisma generate
RUN yarn build

# Only keep what's necessary to run
# FROM registry.access.redhat.com/ubi8/nodejs-18 AS runner
FROM base AS runner

WORKDIR /usr/app

COPY --from=builder /usr/app/dist ./dist
COPY --from=dependencies /usr/app/prod_node_modules node_modules
COPY --from=builder /usr/app/node_modules/.prisma/client ./node_modules/.prisma/client

COPY . .

# ARG COMMIT_HASH=unknown
# ARG BUILD_DATE=unknown

ENV DATA_DIR /data
ENV NODE_ENV production
# ENV COMMIT_HASH $COMMIT_HASH
# ENV BUILD_DATE $BUILD_DATE

# Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# Note: this does NOT get used as the browser puppeteer launches - it's here purely to pull in
# the shared libs (libnss3, libatk, libgtk, etc.) that the Chrome for Testing build Puppeteer
# downloads below actually needs to run headless. See the puppeteer.launch() call in
# src/services/scrape.ts, which uses Puppeteer's own managed browser, not this one.

RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 unzip \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create the unprivileged user everything (including Puppeteer's browser) runs as.
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser ./node_modules \
    && chown -R pptruser:pptruser ./package.json

# Run everything after as non-privileged user.
USER pptruser

# Download the Chrome build Puppeteer actually launches at build time, into pptruser's own
# cache dir, instead of on every container start. Previously this ran as part of CMD on every
# boot, which was slow and meant a network hiccup at startup would crash-loop the bot.
# (Override the base stage's PUPPETEER_SKIP_DOWNLOAD=true - we do want this one, explicit, download.)
ENV PUPPETEER_SKIP_DOWNLOAD=false
RUN npx puppeteer browsers install chrome

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/scripts/migrate-and-start.js", "--enable-source-maps"]
