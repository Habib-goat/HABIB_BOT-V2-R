FROM node:18

RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fonts-noto \
    fonts-noto-extra \
    fonts-freefont-ttf

WORKDIR /app

COPY package*.json ./
RUN npm install

ARG CACHEBUST=1
COPY . .

EXPOSE 8080

CMD echo "===CHECK-START===" && date && echo "--- app.js top ---" && head -n 6 app.js && echo "--- sendMessage.js top ---" && head -n 5 node_modules/fca-riyad/src/api/socket/sendMessage.js && echo "--- applyFcaPatch exists? ---" && ls -la scripts/applyFcaPatch.js && echo "===CHECK-END===" && npm start
