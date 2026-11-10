# =============================================================================
#  VulnCorp Lab 03 — Setup (Windows PowerShell)
#  Curso MAR303 — Universidad Mayor — Profesor Tomás Vera — 2026
#
#  Verifica requisitos, construye las imágenes propias y levanta el entorno.
#  NO requiere instalar Syft ni Grype en el host: corren como contenedores.
#
#  Ejecutar con:  .\scripts\setup.ps1
#  (Si da error de permisos: Set-ExecutionPolicy -Scope Process Bypass)
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "   VulnCorp Lab 03 - De la Vulnerabilidad al C2" -ForegroundColor Cyan
Write-Host "   Curso MAR303 - Universidad Mayor" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Verificar Docker ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X Docker no esta instalado. Instala Docker Desktop:" -ForegroundColor Red
    Write-Host "  https://www.docker.com/products/docker-desktop/"
    exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Docker no esta corriendo. Abre Docker Desktop y vuelve a intentar." -ForegroundColor Red
    exit 1
}

Write-Host "OK Docker activo: $(docker --version)" -ForegroundColor Green

# --- 2. Directorios de datos ---
New-Item -ItemType Directory -Force -Path data\sbom, data\grype, data\exfiltracion | Out-Null

# --- 3. Construir imagenes propias ---
Write-Host ""
Write-Host "Empaquetando imagenes del laboratorio (primera vez: 3-5 min)..." -ForegroundColor Yellow
docker compose build
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Error al construir las imagenes." -ForegroundColor Red
    exit 1
}

# --- 4. Levantar el entorno ---
Write-Host ""
Write-Host "Levantando el entorno..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Error al levantar el entorno." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Esperando que Dependency-Track inicialice (1-3 min)..." -ForegroundColor Yellow
Write-Host "  Puedes seguir con: docker compose logs -f dtrack-apiserver"

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "   LAB 03 LEVANTADO" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "   Estacion de trabajo (noVNC)  : http://localhost:6080"
Write-Host "   Dependency-Track             : http://localhost:8083"
Write-Host "   Dependency-Track API         : http://localhost:8084"
Write-Host "   PetaShop Inventory (victima) : http://localhost:9090"
Write-Host "   Orchestrator API             : http://localhost:8086/api/health"
Write-Host "--------------------------------------------------------------"
Write-Host "   Siguiente paso: abre http://localhost:6080 y sigue"
Write-Host "   docs\LAB_03_STUDENT.md"
Write-Host "==============================================================" -ForegroundColor Green
