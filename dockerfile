# Use a base image that includes Node.js and the necessary utilities
FROM node:22-slim

# Install system dependencies required for Puppeteer/Chromium
# This ensures the 'chromium' binary is available at /usr/bin/chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# --- START OF CORRECTION ---
# Copy package files (we remove 'yarn.lock' since it wasn't committed)
COPY package.json ./
RUN yarn install --production
# --- END OF CORRECTION ---

# Bundle app source (server.js, etc.)
COPY . .

# Expose the port your Express app listens on
ENV PORT 5000
EXPOSE ${PORT}

# Define the command to run your app
CMD [ "node", "server.js" ]