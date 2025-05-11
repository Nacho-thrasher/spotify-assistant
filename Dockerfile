FROM node:20-alpine as frontend

# Construir el frontend
WORKDIR /frontend
COPY frontend/package*.json ./
# Instalar dependencias con flags para usar menos memoria
RUN npm install --no-audit --no-fund --prefer-offline --legacy-peer-deps
# Ahora copiar el resto del código y construir
COPY frontend/ .
RUN npm run build

# Configurar el backend
FROM node:20-alpine
WORKDIR /app

# Instalar dependencias del backend primero (para aprovechar la caché)
COPY backend/package*.json ./
RUN npm install --no-audit --no-fund --prefer-offline --legacy-peer-deps

# Copiar el resto del código del backend
COPY backend/ .

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
