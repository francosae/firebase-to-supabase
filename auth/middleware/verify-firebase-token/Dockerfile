FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./

# Note: You need to copy your firebase-service.json file
# Either:
# 1. Copy it during build: COPY firebase-service.json ./
# 2. Mount it as a Fly.io secret
# 3. Set it via environment variable

EXPOSE 3001

CMD ["node", "server.js"]
