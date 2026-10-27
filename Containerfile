FROM node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS base

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

RUN yarn install --prod --frozen-lockfile
RUN cp -R node_modules /usr/app/prod_node_modules

RUN yarn install --frozen-lockfile

FROM dependencies AS builder

COPY . .

RUN yarn prisma generate
RUN yarn build

# Only keep what's necessary to run
FROM base AS runner

WORKDIR /usr/app

# The unprivileged user everything (including Chrome) runs as. Created first and with a
# fixed uid/gid, so no package installed below can take 997 - existing installs keep their
# data dir owned by 997:997 on the host, and a different uid would lock the bot out of it.
RUN groupadd -r -g 997 pptruser && useradd -r -u 997 -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

COPY --from=builder /usr/app/dist ./dist
COPY --from=dependencies /usr/app/prod_node_modules node_modules
COPY --from=builder /usr/app/node_modules/.prisma/client ./node_modules/.prisma/client

COPY . .

ARG COMMIT_HASH=unknown
ARG BUILD_DATE

ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE
# Shared location (not root's home), readable by pptruser at runtime.
ENV PUPPETEER_CACHE_DIR=/usr/app/.cache/puppeteer

# Fonts for major non-Latin scripts (Chinese, Japanese, Arabic, Hebrew, Thai, ...), so
# pages using them render their text - and screenshots don't show boxes. Plus unzip, which
# Puppeteer unpacks the Chrome download with.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Download the Chrome build Puppeteer launches, plus exactly the system libraries it needs
# (--install-deps), at build time - instead of on every container start, and instead of
# installing a whole second browser (google-chrome-stable) just for its dependencies.
ENV PUPPETEER_SKIP_DOWNLOAD=false
RUN apt-get update \
    && npx puppeteer browsers install chrome --install-deps \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R pptruser:pptruser ./node_modules ./package.json /usr/app/.cache

# Run everything after as non-privileged user.
USER pptruser

# The scheduler writes a timestamp every 15 s while it runs and Discord is connected.
HEALTHCHECK --interval=60s --timeout=10s --start-period=3m --retries=3 \
    CMD ["node", "-e", "const t = Number(require('fs').readFileSync(process.env.HEARTBEAT_FILE || '/tmp/update-day-heartbeat', 'utf8')); process.exit(Date.now() - t < 180000 ? 0 : 1)"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/scripts/migrate-and-start.js"]
