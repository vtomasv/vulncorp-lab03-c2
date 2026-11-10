/**
 * VulnCorp Orchestrator — Content Script
 * Inyecta un panel flotante que SOLAPA la interfaz de Dependency-Track.
 * Desde aquí el alumno lanza el escaneo (Syft + Grype → DTrack) con un click,
 * recibe el progreso y las alertas de bugs de aplicación.
 */

const POLL_MS = 3000;

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res || { error: "sin respuesta" }));
  });
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

function buildPanel() {
  const root = el("div", { id: "vulncorp-panel" });

  // — Header —
  const header = el("div", { class: "vc-header" });
  const title = el("span", { class: "vc-title" }, "⚡ VulnCorp Orchestrator");
  const badge = el("span", { class: "vc-badge" }, "LAB 03");
  const btnMin = el("button", { class: "vc-min", title: "Minimizar" }, "—");
  header.appendChild(title);
  header.appendChild(badge);
  header.appendChild(btnMin);

  // — Cuerpo —
  const body = el("div", { class: "vc-body" });

  const status = el("div", { class: "vc-status" }, "Servicio: verificando…");

  const btnScan = el(
    "button",
    { class: "vc-btn vc-btn-primary", id: "vc-scan" },
    "🔍 Escanear infraestructura (Syft + Grype)"
  );
  const btnAlerts = el(
    "button",
    { class: "vc-btn", id: "vc-alerts" },
    "⚠️ Ver bugs detectados"
  );
  const btnCfg = el("button", { class: "vc-btn vc-btn-small", id: "vc-cfg" }, "⚙️ Configuración API Key");

  const config = el("div", { class: "vc-config", style: "display:none" });
  const cfgInput = el("input", {
    type: "password",
    placeholder: "API Key de Dependency-Track",
    class: "vc-input",
  });
  const cfgSave = el("button", { class: "vc-btn vc-btn-small" }, "Guardar");
  config.appendChild(cfgInput);
  config.appendChild(cfgSave);

  const logBox = el("div", { class: "vc-log" });
  const alertsBox = el("div", { class: "vc-alerts" });

  body.appendChild(status);
  body.appendChild(btnScan);
  body.appendChild(btnAlerts);
  body.appendChild(btnCfg);
  body.appendChild(config);
  body.appendChild(logBox);
  body.appendChild(alertsBox);

  root.appendChild(header);
  root.appendChild(body);
  document.body.appendChild(root);

  // — Comportamiento —
  btnMin.addEventListener("click", () => {
    root.classList.toggle("vc-collapsed");
    btnMin.textContent = root.classList.contains("vc-collapsed") ? "+" : "—";
  });

  btnCfg.addEventListener("click", async () => {
    config.style.display = config.style.display === "none" ? "block" : "none";
    if (config.style.display === "block") {
      const stored = await new Promise((r) =>
        chrome.storage.local.get(["dtrackApiKey"], (x) => r(x))
      );
      cfgInput.value = stored.dtrackApiKey || "";
    }
  });

  cfgSave.addEventListener("click", () => {
    chrome.storage.local.set({ dtrackApiKey: cfgInput.value.trim() }, () => {
      cfgSave.textContent = "✅ Guardada";
      setTimeout(() => (cfgSave.textContent = "Guardar"), 1500);
    });
  });

  async function appendLog(lines) {
    logBox.style.display = "block";
    logBox.innerHTML = "";
    for (const line of lines) {
      const div = el("div", { class: "vc-logline" }, line);
      if (line.includes("ALERTA") || line.includes("⚠️")) div.classList.add("vc-warn");
      if (line.includes("✅")) div.classList.add("vc-ok");
      if (line.includes("❌")) div.classList.add("vc-err");
      logBox.appendChild(div);
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  async function checkHealth() {
    const res = await send({ type: "health" });
    if (res.error) {
      status.textContent = "❌ Orchestrator no disponible (¿docker compose up?)";
      status.className = "vc-status vc-status-bad";
    } else {
      status.textContent = `✅ Orchestrator activo — ${res.targets.length} imagen(es) objetivo`;
      status.className = "vc-status vc-status-ok";
    }
  }

  btnScan.addEventListener("click", async () => {
    btnScan.disabled = true;
    btnScan.textContent = "⏳ Escaneo en curso…";
    alertsBox.innerHTML = "";
    const start = await send({ type: "startScan" });
    if (start.error || !start.jobId) {
      appendLog([`❌ No se pudo iniciar el escaneo: ${start.error || "?"}`]);
      btnScan.disabled = false;
      btnScan.textContent = "🔍 Escanear infraestructura (Syft + Grype)";
      return;
    }
    // Poll de progreso
    const timer = setInterval(async () => {
      const st = await send({ type: "poll", jobId: start.jobId });
      if (st.error) {
        clearInterval(timer);
        appendLog([`❌ ${st.error}`]);
        return;
      }
      appendLog(st.log || []);
      if (st.status === "done" || st.status === "error") {
        clearInterval(timer);
        btnScan.disabled = false;
        btnScan.textContent = "🔍 Escanear infraestructura (Syft + Grype)";
        if (st.status === "done") showAlerts();
      }
    }, POLL_MS);
  });

  async function showAlerts() {
    const res = await send({ type: "alerts" });
    if (res.error || !res.alerts) return;
    alertsBox.innerHTML = "";
    const h = el("div", { class: "vc-alerts-title" }, "🚨 Bugs críticos de aplicación detectados:");
    alertsBox.appendChild(h);
    for (const a of res.alerts) {
      const card = el("div", { class: "vc-alert-card" });
      card.appendChild(el("div", { class: "vc-alert-head" }, `⚠️ ${a.id} — ${a.titulo}`));
      card.appendChild(
        el("div", { class: "vc-alert-meta" }, `${a.cwe} · ${a.owasp} · ${a.componente}`)
      );
      // Badge de priorización: EPSS + KEV
      if (a.epss) {
        const badge = el(
          "div",
          { class: "vc-epss-badge" },
          `📈 EPSS ${(a.epss.probabilidad * 100).toFixed(1)} %` +
          ` · Percentil ${(a.epss.percentil * 100).toFixed(1)}` +
          (a.kev && a.kev.en_kev ? " · 🔥 EN CISA KEV (explotación activa confirmada)" : "")
        );
        card.appendChild(badge);
      }
      card.appendChild(el("div", { class: "vc-alert-desc" }, a.descripcion));
      if (a.epss_narrativa) {
        card.appendChild(el("div", { class: "vc-alert-risk" }, `📈 ${a.epss_narrativa}`));
      }
      card.appendChild(
        el("div", { class: "vc-alert-risk" }, `💼 Riesgo: ${a.riesgo_negocio}`)
      );
      card.appendChild(
        el(
          "div",
          { class: "vc-alert-action" },
          "📌 Acción requerida: emitir requerimiento de remediación al equipo de desarrollo (Fase 2 del lab)."
        )
      );
      alertsBox.appendChild(card);
    }
  }

  btnAlerts.addEventListener("click", showAlerts);

  checkHealth();
  setInterval(checkHealth, 15000);
}

// Evitar doble inyección
if (!document.getElementById("vulncorp-panel")) {
  if (document.body) {
    buildPanel();
  } else {
    window.addEventListener("DOMContentLoaded", buildPanel);
  }
}
