FROM node:20-alpine as frontend

# Construir el frontend
WORKDIR /frontend
COPY frontend/ .
RUN npm install
RUN npm run build

# Configurar el backend
FROM node:20-alpine
WORKDIR /app

# Copiar todo el backend
COPY backend/ .

# Instalar dependencias del backend
RUN npm install

# Copiar build de frontend a carpeta pública en el backend
COPY --from=frontend /frontend/build /app/public

# Variables de entorno por defecto
ENV PORT=8080
ENV NODE_ENV=production
# Las variables de Redis se configuran en Railway

# Puerto expuesto
EXPOSE 8080

# Comando para iniciar aplicación
CMD ["node", "src/server.js"]
