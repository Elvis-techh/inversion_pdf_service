FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root user to copy files and install node modules
USER root

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]