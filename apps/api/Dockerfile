FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @synq/api

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace", "@synq/api"]
