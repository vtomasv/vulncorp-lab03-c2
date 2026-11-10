###############################################################################
#  VulnCorp Lab 03 — Orchestrator
#
#  Servicio API que ejecuta el pipeline de escaneo cuando el alumno hace
#  click en el panel "VulnCorp Orchestrator" (plugin de Chrome que solapa
#  a Dependency-Track):
#
#    1. syft  <imagen>  →  SBOM CycloneDX JSON
#    2. grype sbom:...  →  reporte de vulnerabilidades
#    3. upload SBOM     →  Dependency-Track (REST API)
#    4. alertas         →  Command Injection + File Upload
#
#  Base: docker:27-cli (trae docker CLI para lanzar syft/grype como
#  contenedores usando el docker.sock montado) + Node.js 20.
#
#  Syft y Grype se ejecutan con sus imágenes oficiales multi-arquitectura:
#    - anchore/syft:v1.38.0  (amd64 + arm64)
#    - anchore/grype:v0.95.0 (amd64 + arm64)
###############################################################################

FROM docker:27-cli

RUN apk add --no-cache nodejs npm curl

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/server.js ./

# Directorio de reportes (volumen compartido con syft/grype)
RUN mkdir -p /data/sbom /data/grype

EXPOSE 8080

# IMPORTANTE: el entrypoint del docker:cli anteponería `docker` a cualquier
# comando cuyo primer argumento coincida con un subcomando de docker CLI
# (¡`node` es también `docker node` de Swarm!). Lo anulamos para que el CMD
# se ejecute tal cual.
ENTRYPOINT []

CMD ["node", "server.js"]
