#!/bin/bash
# =============================================================================
#  VulnCorp Lab 03 — Auto-configuración de la estación de trabajo noVNC
#  (se ejecuta al iniciar el contenedor webtop, antes de abrir el escritorio)
#
#  1. Pre-carga la extensión VulnCorp Orchestrator en Chromium
#  2. Crea accesos directos en el Escritorio (DTrack, PetaShop, guía)
#  3. Abre automáticamente Chromium con la extensión activa
# =============================================================================

set -e

EXT_DIR="/config/ext"
AUTOSTART_DIR="/config/.config/autostart"
DESKTOP_DIR="/config/Desktop"

echo "[vulncorp] Configurando estación de trabajo…"

mkdir -p "${AUTOSTART_DIR}" "${DESKTOP_DIR}"

# ---------------------------------------------------------------------------
#  Detectar binario del navegador disponible
# ---------------------------------------------------------------------------
CHROME_BIN=""
for bin in chromium chromium-browser google-chrome; do
  if command -v "${bin}" >/dev/null 2>&1; then
    CHROME_BIN="${bin}"
    break
  fi
done

if [ -n "${CHROME_BIN}" ] && [ -d "${EXT_DIR}" ]; then
  echo "[vulncorp] Navegador detectado: ${CHROME_BIN} — precargando extensión…"
  cat > "${AUTOSTART_DIR}/vulncorp-chromium.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=VulnCorp Browser
Comment=Chromium con la extensión VulnCorp Orchestrator precargada
Exec=${CHROME_BIN} --load-extension=${EXT_DIR} --no-first-run --no-default-browser-check --start-maximized http://localhost:8083 http://localhost:9090
X-GNOME-Autostart-enabled=true
EOF
  chmod +x "${AUTOSTART_DIR}/vulncorp-chromium.desktop"

  # -------------------------------------------------------------------
  #  Parche al launcher del sistema: que TODA invocación de chromium
  #  (autostart, menú de aplicaciones, sesión guardada de XFCE)
  #  cargue la extensión VulnCorp, no solo la nuestra.
  #  El wrapper de linuxserver/webtop es un shell script → insertamos
  #  la bandera justo después del shebang.
  # -------------------------------------------------------------------
  for wrapper in /usr/bin/chromium /usr/bin/chromium-browser; do
    if [ -f "${wrapper}" ] && head -1 "${wrapper}" | grep -q "^#!.*sh" \
       && ! grep -q "vulncorp-ext" "${wrapper}" 2>/dev/null; then
      sed -i '1a\
# vulncorp-ext: precargar la extensión VulnCorp Orchestrator en toda ejecución\
case " $* " in *" --load-extension="*) ;; *) [ -d /config/ext ] && set -- --load-extension=/config/ext "$@" ;; esac' \
        "${wrapper}"
      echo "[vulncorp] Launcher parcheado: ${wrapper}"
    fi
  done
else
  echo "[vulncorp] ADVERTENCIA: no se encontró navegador o extensión. Cargar manualmente."
fi

# ---------------------------------------------------------------------------
#  Accesos directos en el Escritorio
# ---------------------------------------------------------------------------
mk_desktop() {
  local file="$1" name="$2" url="$3" comment="$4"
  cat > "${DESKTOP_DIR}/${file}" <<EOF
[Desktop Entry]
Version=1.0
Type=Link
Name=${name}
Comment=${comment}
URL=${url}
Icon=applications-internet
EOF
}

mk_desktop "dependency-track.desktop"  "Dependency-Track"     "http://localhost:8083" "Plataforma de gestión de SBOM (EPSS)"
mk_desktop "petashop-inventory.desktop" "PetaShop Inventory"   "http://localhost:9090" "Sistema de inventario (máquina víctima)"
mk_desktop "orchestrator-api.desktop"  "Orchestrator API"      "http://localhost:8086/api/health" "Servicio de escaneo Syft+Grype"

chmod +x "${DESKTOP_DIR}"/*.desktop 2>/dev/null || true

# ---------------------------------------------------------------------------
#  Terminal listo con un mensaje de bienvenida
# ---------------------------------------------------------------------------
cat > "/etc/profile.d/99-vulncorp-welcome.sh" <<'EOF'
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║   VulnCorp Lab 03 — De la Vulnerabilidad al C2           ║"
echo "  ║   Curso MAR303 — Universidad Mayor                       ║"
echo "  ╠══════════════════════════════════════════════════════════╣"
echo "  ║   Dependency-Track  : http://localhost:8083              ║"
echo "  ║   PetaShop Inventory: http://localhost:9090              ║"
echo "  ║   Orchestrator API  : http://localhost:8086/api/health   ║"
echo "  ║   Mythic (opcional) : ver docs/MYTHIC_SETUP.md           ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
EOF
chmod +x "/etc/profile.d/99-vulncorp-welcome.sh" 2>/dev/null || true

echo "[vulncorp] Estación de trabajo lista."
