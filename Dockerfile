FROM node:18-alpine

WORKDIR /app

# Copy package.json only (npm install will generate fresh lock)
COPY package.json ./

# Install production dependencies only (skips optional like puppeteer)
RUN npm install --omit=dev --omit=optional && \
    ls -la node_modules/express/package.json

# Copy application code
COPY . .

EXPOSE 8787

CMD ["node", "server.js"]
