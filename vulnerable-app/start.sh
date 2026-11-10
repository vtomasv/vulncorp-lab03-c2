#!/bin/bash
# =============================================================================
#  VulnCorp Lab 03 — arranque de "PetaShop Inventory" (máquina víctima)
#
#  1. Arranca la aplicación vulnerable (OWASP VulnerableApp) en :9090 interno
#  2. Arranca el portal corporativo + proxy inverso en :9091 (puerto expuesto)
# =============================================================================

set -e

echo "[petashop] Iniciando módulo de inventario (VulnerableApp) en :9090…"
java -cp @/app/jib-classpath-file org.sasanlabs.Application &
APP_PID=$!

# Espera a que el upstream responda antes de exponer el portal
echo "[petashop] Esperando a que el módulo de inventario esté listo…"
for i in $(seq 1 60); do
  if curl -s -o /dev/null -m 2 "http://127.0.0.1:9090/VulnerableApp/"; then
    echo "[petashop] Módulo de inventario listo."
    break
  fi
  if ! kill -0 $APP_PID 2>/dev/null; then
    echo "[petashop] ERROR: el módulo de inventario se cayó durante el arranque."
    exit 1
  fi
  sleep 2
done

echo "[petashop] Portal corporativo disponible en :9091"
exec python3 /opt/portal/proxy.py
