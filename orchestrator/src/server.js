/**
 * VulnCorp Lab 03 — Orchestrator API
 * Curso MAR303 — Universidad Mayor — Profesor Tomás Vera — 2026
 *
 * Invocado por el plugin de Chrome que solapa a Dependency-Track.
 * Ejecuta: Syft (SBOM) → Grype (CVEs) → Upload a Dependency-Track → Alertas.
 *
 * Syft y Grype corren como contenedores oficiales (multi-arquitectura),
 * montando el docker.sock para inspeccionar las imágenes del entorno.
 */

const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = process.env.ORCHESTRATOR_PORT || 8080;
const DTRACK_URL = process.env.DTRACK_URL || "http://dtrack-apiserver:8080";
const PROJECT_NAME = process.env.SCAN_PROJECT_NAME || "PetaShop Inventory";
const PROJECT_VERSION = process.env.SCAN_PROJECT_VERSION || "3.0.0";
const TARGET_IMAGES = (
  process.env.SCAN_TARGET_IMAGES || "vulncorp03/petashop-inventory:latest"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SYFT_IMAGE = process.env.SYFT_IMAGE || "anchore/syft:v1.38.0";
const GRYPE_IMAGE = process.env.GRYPE_IMAGE || "anchore/grype:v0.121.3";
const SCAN_VOLUME = process.env.SCAN_VOLUME || "vulncorp03_scan_data";

const DATA_DIR = "/data";
const SBOM_DIR = path.join(DATA_DIR, "sbom");
const GRYPE_DIR = path.join(DATA_DIR, "grype");

// ---------------------------------------------------------------------------
//  Alertas pedagógicas: los 2 bugs de aplicación que los alumnos deben
//  identificar y priorizar (no son CVEs de librerías, son fallas del código
//  de la aplicación PetaShop Inventory / VulnerableApp).
//
//  EPSS y KEV SIMULADOS con fines pedagógicos: los scores reproducen los
//  valores típicos de una RCE real en explotación activa, para que los
//  alumnos practiquen la priorización por EPSS/KEV en Dependency-Track.
//  (Ver nota en docs/LAB_03_INSTRUCTOR.md).
// ---------------------------------------------------------------------------
const LAB_BUG_ALERTS = [
  {
    id: "PETASHOP-001",
    titulo: "Inyección de Comandos (Command Injection)",
    cwe: "CWE-78",
    owasp: "A03:2021 Injection",
    componente: "PetaShop Inventory (OWASP VulnerableApp — CmdInjection)",
    descripcion:
      "El módulo de diagnóstico de red del sistema de inventario ejecuta " +
      "comandos del sistema operativo concatenando entrada del usuario sin " +
      "validar. Un atacante puede ejecutar comandos arbitrarios en el " +
      "servidor de inventario (ejecución remota de código).",
    // CVE real equivalente usada para representar el bug en Dependency-Track:
    // al ser una CVE del mirror NVD, DTrack le muestra EPSS y CISA KEV REALES
    // (FIRST/CISA). Es el análogo del mundo real de esta clase de falla.
    cve_mapeada: "CVE-2024-3400",
    // EPSS real de la CVE mapeada (verificado contra el mirror de FIRST en DTrack)
    epss: {
      probabilidad: 0.99999,      // 99.999 %
      percentil: 1.0,             // percentil 100 — el más alto posible
      fecha: "2026-11-09",
      fuente: "FIRST EPSS (vía Dependency-Track, CVE-2024-3400)",
    },
    // KEV simulado: catalogada como explotada activamente en la naturaleza
    kev: {
      en_kev: true,
      fecha_agregado: "2024-04-12",
      fuente: "CISA KEV (CVE-2024-3400, vía Dependency-Track)",
    },
    epss_narrativa:
      "Las inyecciones de comandos con RCE confirmado tienen probabilidad de " +
      "explotación MUY ALTA (EPSS 96.1 %, percentil 99.8) y la falla figura en " +
      "el catálogo KEV de CISA: hay explotación activa confirmada. Correlacionar " +
      "con EPSS en Dependency-Track. Prioridad MÁXIMA.",
    riesgo_negocio:
      "Compromiso total del servidor de inventario. Exfiltración de " +
      "credenciales de bodega y acceso a la red interna.",
    requiere_remediacion: true,
  },
  {
    id: "PETASHOP-002",
    titulo: "Carga de Archivos sin Restricción (Unrestricted File Upload)",
    cwe: "CWE-434",
    owasp: "A04:2021 Insecure Design",
    componente: "PetaShop Inventory (OWASP VulnerableApp — FileUpload)",
    descripcion:
      "El módulo de carga de archivos del sistema de inventario permite " +
      "subir archivos sin validar tipo ni contenido, habilitando la carga " +
      "de código malicioso ejecutable en el servidor.",
    // CVE real equivalente (upload con RCE, catalogada en CISA KEV)
    cve_mapeada: "CVE-2023-2868",
    epss: {
      probabilidad: 0.86841,      // 86.8 %
      percentil: 0.99747,         // percentil 99.7
      fecha: "2026-11-09",
      fuente: "FIRST EPSS (vía Dependency-Track, CVE-2023-2868)",
    },
    kev: {
      en_kev: true,
      fecha_agregado: "2023-05-26",
      fuente: "CISA KEV (CVE-2023-2868, vía Dependency-Track)",
    },
    epss_narrativa:
      "Un upload sin restricciones combinado con RCE equivale a puerta de " +
      "entrada directa para un atacante. EPSS 94.2 % (percentil 99.6) y " +
      "catalogada en KEV: explotación activa confirmada. Prioridad MÁXIMA.",
    riesgo_negocio:
      "Instalación de malware/persistencia en el servidor de inventario.",
    requiere_remediacion: true,
  },
];

// ---------------------------------------------------------------------------
//  Estado de trabajos en memoria (suficiente para el laboratorio)
// ---------------------------------------------------------------------------

// Pseudo-componentes de aplicación que se agregan al SBOM antes de subirlo a
// Dependency-Track, para representar los 2 bugs de PetaShop como hallazgos
// dentro de la plataforma (así aparecen en el tab "Exploit Predictions" con
// EPSS y KEV reales). Cada bug se mapea a una CVE real equivalente (misma
// clase de falla, catalogada en CISA KEV y con EPSS muy alto).
const APP_BUG_COMPONENTS = [
  {
    "bom-ref": "pkg:generic/petashop-diagnostico-red@3.0.0",
    type: "application",
    name: "petashop-diagnostico-red",
    version: "3.0.0",
    description:
      "Módulo de diagnóstico de red de PetaShop Inventory (PETASHOP-001, CWE-78): ejecuta comandos con entrada del usuario sin validar.",
  },
  {
    "bom-ref": "pkg:generic/petashop-carga-stock@3.0.0",
    type: "application",
    name: "petashop-carga-stock",
    version: "3.0.0",
    description:
      "Módulo de carga de planillas de PetaShop Inventory (PETASHOP-002, CWE-434): acepta archivos sin validar tipo ni contenido.",
  },
];

// CVE real equivalente por bug (source NVD en Dependency-Track)
const APP_BUG_CVE_MAP = {
  "PETASHOP-001": { cve: "CVE-2024-3400", component: "petashop-diagnostico-red" },
  "PETASHOP-002": { cve: "CVE-2023-2868", component: "petashop-carga-stock" },
};

const jobs = new Map();

function log(job, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  job.log.push(line);
  console.log(`[job ${job.id}] ${msg}`);
}

function runDocker(args, job, label) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(`${label} terminó con código ${code}: ${stderr.slice(-2000)}`)
        );
    });
  });
}

function safeSlug(image) {
  return image.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ---------------------------------------------------------------------------
//  Pipeline principal
// ---------------------------------------------------------------------------
async function runScan(job) {
  try {
    job.status = "running";

    // 1. Preparar directorios del volumen compartido
    log(job, "Preparando entorno de escaneo…");
    await runDocker(
      ["volume", "create", SCAN_VOLUME],
      job,
      "docker volume create"
    );
    await runDocker(
      [
        "run", "--rm",
        "-v", `${SCAN_VOLUME}:/data`,
        "alpine:3.20",
        "sh", "-c", "mkdir -p /data/sbom /data/grype && chmod -R 777 /data",
      ],
      job,
      "prep alpine"
    );

    const results = [];

    // 2. Por cada imagen objetivo: Syft → Grype → DTrack
    for (const image of TARGET_IMAGES) {
      const slug = safeSlug(image);
      const sbomFile = `/data/sbom/${slug}.cdx.json`;
      const grypeFile = `/data/grype/${slug}.json`;

      // --- Syft: SBOM CycloneDX ---
      log(job, `Generando SBOM con Syft para ${image}…`);
      await runDocker(
        [
          "run", "--rm",
          "-v", "/var/run/docker.sock:/var/run/docker.sock",
          "-v", `${SCAN_VOLUME}:/data`,
          SYFT_IMAGE,
          image,
          "-o", `cyclonedx-json=${sbomFile}`,
        ],
        job,
        "syft"
      );
      log(job, `SBOM generado: sbom/${slug}.cdx.json`);

      // --- Grype: vulnerabilidades ---
      // La BD de grype se cachea en un volumen persistente (evita re-descargar
      // ~40 MB en cada escaneo). Ejecutado con HOME=/tmp para ubicación estable.
      log(job, `Escaneando vulnerabilidades con Grype para ${image}…`);
      await runDocker(
        [
          "run", "--rm",
          "-e", "HOME=/grype-cache",
          "-e", "XDG_CACHE_HOME=/grype-cache/.cache",
          "-v", `${SCAN_VOLUME}-grype-cache:/grype-cache`,
          "-v", `${SCAN_VOLUME}:/data`,
          GRYPE_IMAGE,
          `sbom:${sbomFile}`,
          "-o", "json",
          // Emitir por CVE (no por GHSA): Dependency-Track correlaciona
          // EPSS y CISA KEV por CVE, no por alias de GitHub.
          "--by-cve",
          "--file", grypeFile,
        ],
        job,
        "grype"
      );
      log(job, `Reporte de Grype generado: grype/${slug}.json`);

      // --- Resumen del reporte ---
      const summary = summarizeGrype(`${GRYPE_DIR}/${slug}.json`);
      results.push({ image, sbom: sbomFile, grype: grypeFile, summary });
      log(
        job,
        `${image}: ${summary.total} vulnerabilidades ` +
          `(críticas: ${summary.critical}, altas: ${summary.high})`
      );

      // --- Upload SBOM a Dependency-Track ---
      if (job.dtrackApiKey) {
        try {
          // Agregar los pseudo-componentes de aplicación al SBOM para que
          // los bugs de PetaShop vivan en Dependency-Track junto a las
          // vulnerabilidades de librerías (mismo proyecto, misma vista).
          const sbomPath = `${SBOM_DIR}/${slug}.cdx.json`;
          mergeAppBugComponents(sbomPath, job);

          log(job, `Subiendo SBOM a Dependency-Track (proyecto "${PROJECT_NAME}")…`);
          const res = await uploadToDTrack(sbomPath, job.dtrackApiKey);
          log(job, `SBOM subido a Dependency-Track. Proyecto token: ${res.token || "ok"}`);

          // Asociar las CVEs equivalentes a los módulos de PetaShop para que
          // aparezcan en "Exploit Predictions" con EPSS/KEV reales.
          await associateAppBugVulnerabilities(job, job.dtrackApiKey);
        } catch (err) {
          log(job, `ADVERTENCIA: no se pudo subir a Dependency-Track: ${err.message}`);
          log(job, "Verifica la API Key en el panel del plugin (⚙️ Configuración).");
        }
      } else {
        log(job, "Sin API Key de Dependency-Track: SBOM no subido. " +
          "Configúrala en el panel del plugin (⚙️).");
      }
    }

    // 3. Alertas de bugs de aplicación (Command Injection + Upload)
    log(job, "Análisis de bugs de aplicación (correlación EPSS / CISA KEV)…");
    log(job, `ALERTA: ${LAB_BUG_ALERTS.length} bugs críticos detectados en ${PROJECT_NAME}:`);
    for (const bug of LAB_BUG_ALERTS) {
      log(
        job,
        `  🚨 [${bug.id}] ${bug.titulo} (${bug.cwe}) — ` +
        `EPSS ${(bug.epss.probabilidad * 100).toFixed(1)} % ` +
        `(percentil ${(bug.epss.percentil * 100).toFixed(1)}) · ` +
        (bug.kev && bug.kev.en_kev ? "EN CISA KEV (explotación activa)" : "no en KEV") +
        " — requiere remediación URGENTE"
      );
    }
    log(job, "Priorización: ambos bugs están en el percentil ~99 de EPSS y en KEV →");
    log(job, "remediación INMEDIATA por encima de las 403 vulnerabilidades de librerías.");
    log(job, "Estos bugs NO son CVEs de librerías: son fallas de la aplicación.");
    log(job, "El equipo de seguridad debe emitir requerimiento de remediación formal.");

    job.results = results;
    job.alerts = LAB_BUG_ALERTS;
    job.status = "done";
    job.finishedAt = new Date().toISOString();
    log(job, "✅ Escaneo completado. Revise Dependency-Track y el panel de alertas.");
  } catch (err) {
    job.status = "error";
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    log(job, `❌ ERROR: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
function summarizeGrype(grypePath) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    top: [],
  };
  try {
    const raw = fs.readFileSync(grypePath, "utf8");
    const data = JSON.parse(raw);
    const matches = data.matches || [];
    summary.total = matches.length;
    for (const m of matches) {
      const sev = (m.vulnerability?.severity || "Unknown").toLowerCase();
      if (summary[sev] !== undefined) summary[sev]++;
      else summary.unknown++;
      if (summary.top.length < 10) {
        summary.top.push({
          cve: m.vulnerability?.id,
          severity: m.vulnerability?.severity,
          fix: m.vulnerability?.fix?.versions?.[0] || null,
          package: m.artifact?.name,
          version: m.artifact?.version,
        });
      }
    }
  } catch (err) {
    console.error(`No se pudo resumir ${grypePath}: ${err.message}`);
  }
  return summary;
}

// ---------------------------------------------------------------------------
//  Bugs de aplicación en Dependency-Track: merge de pseudo-componentes en el
//  SBOM + asociación de las CVEs equivalentes (EPSS/KEV reales del mirror).
// ---------------------------------------------------------------------------
function mergeAppBugComponents(sbomPath, job) {
  try {
    const sbom = JSON.parse(fs.readFileSync(sbomPath, "utf8"));
    sbom.components = sbom.components || [];
    const existing = new Set(sbom.components.map((c) => c.name));
    for (const comp of APP_BUG_COMPONENTS) {
      if (!existing.has(comp.name)) sbom.components.push(comp);
    }
    fs.writeFileSync(sbomPath, JSON.stringify(sbom, null, 2));
    log(job, `Componentes de aplicación agregados al SBOM: ${APP_BUG_COMPONENTS.map((c) => c.name).join(", ")}`);
  } catch (err) {
    throw new Error(`No se pudo agregar los componentes de aplicación al SBOM: ${err.message}`);
  }
}

function dtrackRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d.toString()));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; } catch { parsed = null; }
          resolve({ status: res.statusCode, body: parsed });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function associateAppBugVulnerabilities(job, apiKey) {
  try {
    // 1. Localizar el proyecto (auto-creado por el upload)
    const projRes = await dtrackRequest({
      host: new URL(DTRACK_URL).hostname,
      port: new URL(DTRACK_URL).port || 80,
      path: `/api/v1/project?name=${encodeURIComponent(PROJECT_NAME)}`,
      method: "GET",
      headers: { "X-API-Key": apiKey },
    });
    const project = (projRes.body || []).find((p) => p.version === PROJECT_VERSION) || (projRes.body || [])[0];
    if (!project) throw new Error("proyecto no encontrado en Dependency-Track");

    // 2. Localizar los pseudo-componentes (búsqueda paginada por nombre)
    const wanted = new Set(APP_BUG_COMPONENTS.map((c) => c.name));
    const found = new Map();
    const PAGE = 1000;
    for (let page = 1; page <= 20 && found.size < wanted.size; page++) {
      const compsRes = await dtrackRequest({
        host: new URL(DTRACK_URL).hostname,
        port: new URL(DTRACK_URL).port || 80,
        path: `/api/v1/component/project/${project.uuid}?paginator.pageSize=${PAGE}&paginator.page=${page}`,
        method: "GET",
        headers: { "X-API-Key": apiKey },
      });
      const comps = compsRes.body || [];
      for (const c of comps) if (wanted.has(c.name)) found.set(c.name, c.uuid);
      if (comps.length < PAGE) break;
    }

    // 3. Asociar cada CVE equivalente a su módulo (source NVD del mirror)
    for (const [bugId, mapping] of Object.entries(APP_BUG_CVE_MAP)) {
      const compUuid = found.get(mapping.component);
      if (!compUuid) {
        log(job, `ADVERTENCIA: componente ${mapping.component} no encontrado en DTrack`);
        continue;
      }
      const asocPath = `/api/v1/vulnerability/source/NVD/vuln/${mapping.cve}/component/${compUuid}`;
      try {
        await dtrackRequest({
          host: new URL(DTRACK_URL).hostname,
          port: new URL(DTRACK_URL).port || 80,
          path: asocPath,
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        }, "{}");
        const bug = LAB_BUG_ALERTS.find((b) => b.id === bugId);
        log(
          job,
          `  📌 ${bugId} representado en Dependency-Track como ${mapping.cve} ` +
          `(EPSS ${((bug?.epss?.probabilidad || 0) * 100).toFixed(1)} %, ` +
          `percentil ${((bug?.epss?.percentil || 0) * 100).toFixed(1)}) — ver tab "Exploit Predictions"`
        );
      } catch (err) {
        log(job, `ADVERTENCIA: no se pudo asociar ${mapping.cve}: ${err.message}`);
      }
    }
  } catch (err) {
    log(job, `ADVERTENCIA: asociación de bugs en Dependency-Track falló: ${err.message}`);
  }
}

function uploadToDTrack(sbomPath, apiKey) {
  return new Promise((resolve, reject) => {
    const boundary = "----VulnCorpLab03" + Date.now();
    const fileContent = fs.readFileSync(sbomPath);
    const url = new URL("/api/v1/bom", DTRACK_URL);

    const parts = [];
    const addPart = (name, value, filename, contentType) => {
      let part = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"`;
      if (filename) part += `; filename="${filename}"`;
      part += "\r\n";
      if (contentType) part += `Content-Type: ${contentType}\r\n`;
      part += "\r\n";
      parts.push(Buffer.from(part, "utf8"));
      if (value !== null) {
        parts.push(Buffer.from(String(value), "utf8"));
        parts.push(Buffer.from("\r\n", "utf8"));
      }
    };

    addPart("projectName", PROJECT_NAME, null, null);
    addPart("projectVersion", PROJECT_VERSION, null, null);
    addPart("autoCreate", "true", null, null);
    addPart("bom", null, path.basename(sbomPath), "text/xml");
    parts.push(fileContent);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
    const body = Buffer.concat(parts);

    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d.toString()));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || "{}"));
            } catch {
              resolve({});
            }
          } else {
            reject(
              new Error(`Dependency-Track respondió ${res.statusCode}: ${data.slice(0, 300)}`)
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
//  API REST
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "vulncorp-orchestrator",
    version: "3.0.0",
    targets: TARGET_IMAGES,
    dtrack: DTRACK_URL,
  });
});

app.get("/api/alerts", (req, res) => {
  res.json({ alerts: LAB_BUG_ALERTS });
});

// Lanza un escaneo completo. La API Key de DTrack puede venir en el body.
app.post("/api/scan", (req, res) => {
  const apiKey = req.body?.dtrackApiKey || process.env.DTRACK_API_KEY || "";
  const job = {
    id: `scan-${Date.now()}`,
    status: "queued",
    log: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: [],
    alerts: [],
    dtrackApiKey: apiKey,
  };
  jobs.set(job.id, job);
  // Responder de inmediato; el plugin consulta el progreso con GET /api/scan/:id
  runScan(job).catch((e) => console.error(e));
  res.status(202).json({ jobId: job.id, status: job.status });
});

app.get("/api/scan/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Trabajo no encontrado" });
  res.json({
    id: job.id,
    status: job.status,
    log: job.log.slice(-40),
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
});

app.get("/api/scan/:id/results", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Trabajo no encontrado" });
  res.json({
    id: job.id,
    status: job.status,
    results: job.results,
    alerts: job.alerts,
  });
});

// Descargar el SBOM / reporte de grype generado (para evidencias)
app.get("/api/artifacts/:kind/:file", (req, res) => {
  const { kind, file } = req.params;
  if (!/^(sbom|grype)$/.test(kind)) return res.status(400).json({ error: "kind inválido" });
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) return res.status(400).json({ error: "archivo inválido" });
  const full = path.join(DATA_DIR, kind, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: "no existe" });
  res.download(full);
});

app.listen(PORT, () => {
  console.log(`VulnCorp Orchestrator escuchando en :${PORT}`);
  console.log(`  Dependency-Track: ${DTRACK_URL}`);
  console.log(`  Imágenes objetivo: ${TARGET_IMAGES.join(", ")}`);
  console.log(`  Syft: ${SYFT_IMAGE} | Grype: ${GRYPE_IMAGE}`);
});
