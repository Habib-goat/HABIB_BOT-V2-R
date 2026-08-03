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
COPY patches ./patches
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
