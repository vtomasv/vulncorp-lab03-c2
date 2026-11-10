#!/bin/bash
# =============================================================================
#  VulnCorp Lab 03 — Reenviadores de puertos dentro del webtop (noVNC)
#
#  Dentro de este contenedor, "localhost" apunta al propio contenedor, no al
#  host. Para que el alumno use las MISMAS URLs de localhost dentro del noVNC
#  que en su navegador (y para que la extensión de Chrome funcione sin
#  cambios), se levantan forwarders TCP con socat hacia los servicios de las
#  redes del compose.
# =============================================================================

set -e

echo "[vulncorp] Configurando reenviadores de puertos (socat)…"

# Instalar socat si no existe
if ! command -v socat >/dev/null 2>&1; then
  echo "[vulncorp] Instalando socat…"
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq socat >/dev/null 2>&1 || {
    echo "[vulncorp] ERROR: no se pudo instalar socat"; exit 0; }
fi

# Formato: puerto_local:hostname_destino:puerto_destino
FORWARDS="
8083:dtrack-frontend:8080
8084:dtrack-apiserver:8080
8086:orchestrator:8080
9090:petashop-inventory:9091"

mkdir -p /var/log/vulncorp

for entry in $FORWARDS; do
  LPORT="${entry%%:*}"
  REST="${entry#*:}"
  THOST="${REST%%:*}"
  TPORT="${REST##*:}"

  # Evitar duplicados si el script se corre dos veces
  if pgrep -f "socat TCP-LISTEN:${LPORT}," >/dev/null 2>&1; then
    echo "[vulncorp] localhost:${LPORT} ya activo"
    continue
  fi

  nohup socat "TCP-LISTEN:${LPORT},fork,reuseaddr" "TCP:${THOST}:${TPORT}" \
    > "/var/log/vulncorp/socat-${LPORT}.log" 2>&1 &
  disown || true
  echo "[vulncorp] localhost:${LPORT} → ${THOST}:${TPORT}"
done

echo "[vulncorp] Reenviadores listos. localhost funciona igual que en el host."
