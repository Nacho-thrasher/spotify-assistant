FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (para aprovechar caché de Docker)
COPY package*.json ./
RUN npm install

# Copiar código fuente
COPY . .

# Variables de entorno por defecto
ENV PORT=8080
ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

# Puerto expuesto
EXPOSE 8080

# Comando para iniciar aplicación
CMD ["node", "src/server.js"]
