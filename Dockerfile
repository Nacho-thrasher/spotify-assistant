FROM node:20-alpine

WORKDIR /app

# Copiar todo el backend
COPY backend/ .

# Instalar dependencias
RUN npm install

# Variables de entorno por defecto
ENV PORT=8080
ENV NODE_ENV=production
# Las variables de Redis se configuran en Railway

# Puerto expuesto
EXPOSE 8080

# Comando para iniciar aplicación
CMD ["node", "src/server.js"]
