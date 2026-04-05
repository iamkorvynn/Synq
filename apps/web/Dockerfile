FROM node:22-alpine

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @synq/web

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "@synq/web"]
