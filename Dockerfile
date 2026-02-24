FROM mcr.microsoft.com/playwright:v1.50.1-jammy

WORKDIR /app

# Install Node deps. Keep devDependencies because this repo runs Playwright tests.
COPY package.json package-lock.json* ./

# Browsers are already included in the Playwright base image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm ci

COPY . .

# Render provides PORT; default is 3001 locally
ENV PORT=3001

EXPOSE 3001

CMD ["npm","start"]


