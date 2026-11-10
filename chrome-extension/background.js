/**
 * VulnCorp Orchestrator — Service Worker (MV3)
 * Realiza las llamadas al Orchestrator API (evita restricciones de CSP
 * de la página de Dependency-Track).
 */

const ORCHESTRATOR = "http://localhost:8086";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${ORCHESTRATOR}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`Orchestrator respondió ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "health") {
        sendResponse(await apiFetch("/api/health"));
      } else if (msg.type === "startScan") {
        const stored = await chrome.storage.local.get(["dtrackApiKey"]);
        sendResponse(
          await apiFetch("/api/scan", {
            method: "POST",
            body: JSON.stringify({ dtrackApiKey: stored.dtrackApiKey || "" }),
          })
        );
      } else if (msg.type === "poll") {
        sendResponse(await apiFetch(`/api/scan/${msg.jobId}`));
      } else if (msg.type === "results") {
        sendResponse(await apiFetch(`/api/scan/${msg.jobId}/results`));
      } else if (msg.type === "alerts") {
        sendResponse(await apiFetch("/api/alerts"));
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // canal asíncrono
});
