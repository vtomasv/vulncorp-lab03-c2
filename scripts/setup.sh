#!/bin/bash
# =============================================================================
#  VulnCorp Lab 03 — Setup (Linux / macOS / Git Bash)
#  Curso MAR303 — Universidad Mayor — Profesor Tomás Vera — 2026
#
#  Verifica requisitos, construye las imágenes propias y levanta el entorno.
#  NO requiere instalar Syft ni Grype en el host: corren como contenedores.
# =============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   VulnCorp Lab 03 — De la Vulnerabilidad al C2               ║"
echo "║   Curso MAR303 — Universidad Mayor                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# --- 1. Verificar Docker ---
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker no está instalado. Instala Docker Desktop:"
  echo "   macOS : https://www.docker.com/products/docker-desktop/"
  echo "   Windows: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker no está corriendo. Abre Docker Desktop y vuelve a intentar."
  echo "   TIP (Apple Silicon): habilita 'Use Rosetta for x86_64/amd64 emulation'"
  echo "   en Settings → General para máxima compatibilidad de imágenes."
  exit 1
fi

echo "✅ Docker activo: $(docker --version)"

# --- 2. Verificar RAM asignada a Docker (recomendado: 8 GB para este lab) ---
TOTAL_MEM=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
if [ "$TOTAL_MEM" -lt 6442450944 ]; then
  echo "⚠️  ADVERTENCIA: Docker tiene menos de 6 GB de RAM asignada."
  echo "   Dependency-Track necesita ~3 GB. Sube la memoria en"
  echo "   Docker Desktop → Settings → Resources (recomendado: 8 GB)."
fi

# --- 3. Traer la última versión del repo (fixes y mejoras) ---
if [ -d .git ]; then
  echo ""
  echo "🔄 Actualizando el laboratorio a la última versión…"
  if ! git pull --ff-only; then
    echo "⚠️  No se pudo actualizar (¿sin conexión o cambios locales?)."
    echo "   Continuo con la versión actual del código."
  fi
fi

# --- 4. Directorios de datos ---
mkdir -p data/sbom data/grype data/exfiltracion

# --- 5. Construir imágenes propias (víctima + orchestrator) ---
echo ""
echo "📦 Construyendo imágenes del laboratorio (primera vez: ~3-5 min)…"
docker compose build

# --- 6. Levantar el entorno ---
echo ""
echo "🚀 Levantando el entorno…"
docker compose up -d

# --- 7. Recrear el webtop: re-ejecuta sus scripts de init (forwards socat,
#        accesos directos del Escritorio y extensión de Chrome precargada).
#        Es lo que hace que el plugin y localhost SIEMPRE queden operativos
#        dentro del noVNC, también con clones antiguos de Windows (CRLF).
echo ""
echo "🖥️  Reconfigurando la estación de trabajo (noVNC)…"
docker compose up -d --force-recreate webtop-init webtop || \
  echo "⚠️  No se pudo recrear el webtop — revisa 'docker compose logs webtop'."

echo ""
echo "⏳ Esperando que Dependency-Track inicialice (esto tarda 1-3 min)…"
echo "   Puedes seguir con 'docker compose logs -f dtrack-apiserver'"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   ✅ LAB 03 LEVANTADO                                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   Estación de trabajo (noVNC) : http://localhost:6080        ║"
echo "║   Dependency-Track            : http://localhost:8083        ║"
echo "║   Dependency-Track API        : http://localhost:8084        ║"
echo "║   PetaShop Inventory (víctima): http://localhost:9090        ║"
echo "║   Orchestrator API            : http://localhost:8086/api/health║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   Siguiente paso: abre http://localhost:6080 y sigue         ║"
echo "║   docs/LAB_03_STUDENT.md                                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
