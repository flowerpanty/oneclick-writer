FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install production dependencies only (skips optional like puppeteer)
RUN npm ci --omit=dev --omit=optional

# Copy application code
COPY . .

EXPOSE 8787

CMD ["node", "server.js"]
