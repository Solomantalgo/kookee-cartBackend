# Start from a Node.js base image (use an LTS version, e.g., 18 or 20)
FROM node:20-slim

# Install necessary system dependencies for Puppeteer/Chromium on Debian-based images
# These packages are required for the browser to function properly
RUN apt-get update \
    && apt-get install -y \
    chromium \
    # The following are common dependencies for headless Chromium
    gconf-service \
    libappindicator1 \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm-dev \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libindicator7 \
    libjpeg-turbo8 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    lsb-release \
    xdg-utils \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Adjust Puppeteer launch arguments for the container environment
# Your server.js already uses this: puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
# You may also need to explicitly set the executable path if issues arise
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose the port your app is listening on (5000 in your server.js)
EXPOSE 5000

# Command to run the application
CMD [ "node", "server.js" ]