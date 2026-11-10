# Matriz de Roles y Tareas — Lab 03 (equipos de 5)

**Curso MAR303 — Universidad Mayor — 2026**

Cada rol tiene tareas individuales, tareas compartidas y entregables
calificables. Los roles son interdependientes: el equipo necesita los 5.

---

## 🔍 Rol 1 — Analista de Vulnerabilidades

*"Conozco la superficie de ataque mejor que nadie en PetaShop."*

### Tareas

| # | Tarea | Herramienta |
|---|-------|-------------|
| 1.1 | Levantar el entorno y validar servicios (`/api/health` de todo) | Docker |
| 1.2 | Ejecutar el escaneo desde el plugin (Syft → Grype → DTrack) | Plugin + Orchestrator |
| 1.3 | Analizar el proyecto en Dependency-Track: componentes y vulnerabilidades | Dependency-Track |
| 1.4 | Construir matriz de priorización: CVSS vs **EPSS** vs CISA KEV | Dependency-Track |
| 1.5 | Entregar al Documentador el "top de riesgos" con sustento de datos | — |

### Entregables
- [ ] Matriz de top 10 vulnerabilidades (CVE, componente, CVSS, EPSS, KEV)
- [ ] Capturas del pipeline Syft → Grype → DTrack corriendo
- [ ] Análisis escrito: 3 decisiones de priorización justificadas con EPSS

---

## 💥 Rol 2 — Explotador (Red Team Operator)

*"Si yo puedo hacerlo en un laboratorio, un atacante lo hace en producción."*

### Tareas

| # | Tarea | Herramienta |
|---|-------|-------------|
| 2.1 | Reconocer PetaShop Inventory (http://localhost:9090): mapear endpoints vulnerables | Navegador |
| 2.2 | Explotar **CmdInjection** (reconocimiento: `id`, `ls`, `cat`) | VulnerableApp |
| 2.3 | O explotar **FileUpload** (el equipo elige camino A o B) | VulnerableApp |
| 2.4 | Combinar ambos bugs para subir y ejecutar el payload de Medusa | VulnerableApp |
| 2.5 | Entregar al Operador C2 la confirmación del callback | Mythic |

### Entregables
- [ ] PoC documentada paso a paso con capturas (payload + respuesta)
- [ ] Callback de Medusa activo en Mythic (captura)
- [ ] Nota técnica: validación faltante en la app (para el informe del Rol 5)

---

## 🐍 Rol 3 — Operador C2 (Mythic Engineer)

*"Mi infraestructura es invisible para el defensor — y reproducible para el auditor."*

### Tareas

| # | Tarea | Herramienta |
|---|-------|-------------|
| 3.1 | Instalar Mythic siguiendo `docs/MYTHIC_SETUP.md` | mythic-cli |
| 3.2 | Instalar agente **Medusa** y perfil C2 **http** | mythic-cli |
| 3.3 | Configurar red: callback en `host.docker.internal` | Mythic + Docker |
| 3.4 | Generar el payload Medusa (Linux x64) y entregárselo al Explotador | Mythic |
| 3.5 | Gestionar la sesión: reconocimiento, `download` del archivo de evidencia | Mythic |
| 3.6 | Registrar el IOCs (indicadores) generados: dominio, puerto, hash del payload | Mythic |

### Entregables
- [ ] Mythic operativo (captura del dashboard)
- [ ] Payload generado con hash SHA-256 documentado
- [ ] Sesión activa con comandos ejecutados (captura de la timeline)
- [ ] Lista de IOCs del ejercicio (para el informe final)

---

## 📦 Rol 4 — Exfiltrador de Evidencias (Forense de Cadena de Custodia)

*"La evidencia que no está garantizada, no existe."*

### Tareas

| # | Tarea | Herramienta |
|---|-------|-------------|
| 4.1 | Definir qué archivos evidencian el compromiso (con el Documentador) | — |
| 4.2 | Localizar el documento de credenciales en la víctima (`ls /opt/petashop`) | Mythic |
| 4.3 | Descargar el archivo con `download` de Mythic | Mythic |
| 4.4 | Calcular hashes SHA-256 de original y copia; verificar que coincidan | Terminal |
| 4.5 | Guardar copia en `data/exfiltracion/` con hora y responsable | noVNC |
| 4.6 | Redactar la **cadena de custodia** del ejercicio | — |

### Entregables
- [ ] Archivo exfiltrado con la flag `VULNCORP{…}` visible
- [ ] Hashes SHA-256 documentados (original = copia)
- [ ] Acta de cadena de custodia (formato: quién, qué, cuándo, cómo, hash)

---

## 📝 Rol 5 — Documentador / Analista de Riesgo (CISO del día)

*"Mi trabajo es que la gerencia no pueda decir 'nadie me avisó'."*

### Tareas

| # | Tarea | Herramienta |
|---|-------|-------------|
| 5.1 | Consolidar el informe de riesgo de los 2 bugs (PETASHOP-001/002) | Plugin (alertas) |
| 5.2 | Redactar el requerimiento de remediación formal con plazo | — |
| 5.3 | Simular el silencio de la gerencia (registrar fechas y respuestas) | — |
| 5.4 | Consolidar la cronología del ataque con timestamps de cada rol | — |
| 5.5 | Redactar el informe ejecutivo final y preparar la presentación (10 min) | — |

### Entregables
- [ ] Informe de riesgo (pre-ataque) con EPSS y plan de remediación
- [ ] Ticket de requerimiento "no respondido" documentado
- [ ] Cronología completa del incidente
- [ ] Informe ejecutivo final + presentación

---

## Reglas del ejercicio

1. **Todo queda dentro de Docker/local.** No escanear, ni atacar, ni apuntar
   a nada fuera de `localhost` / `host.docker.internal`.
2. **Cada rol documenta su parte en el momento** — las capturas tardías no valen.
3. Si un rol se bloquea >20 min, el equipo rota ayuda (pero el entregable
   individual sigue siendo del responsable).
4. La flag solo cuenta si está en la **cadena de custodia** del Rol 4.
5. El informe final debe mostrar **ambas caras**: gestión (prevención) y
   red team (impacto).
