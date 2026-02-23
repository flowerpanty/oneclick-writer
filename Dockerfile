FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies (production only, skip optional like puppeteer)
RUN npm install --omit=dev --ignore-scripts --no-optional

# Copy application code
COPY . .

EXPOSE 8787

CMD ["node", "server.js"]
