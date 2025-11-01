# Use a base image that includes Node.js and the necessary utilities
FROM node:22-slim

# Install system dependencies required for Puppeteer/Chromium
# This part replaces your failed 'apt-get install chromium' command
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

# Copy package files and install Node dependencies
# We use yarn since your project uses yarn lock files
COPY package.json yarn.lock ./
RUN yarn install --production

# Bundle app source
COPY . .

# Expose the port your Express app listens on
ENV PORT 5000
EXPOSE ${PORT}

# Define the command to run your app
CMD [ "node", "server.js" ]