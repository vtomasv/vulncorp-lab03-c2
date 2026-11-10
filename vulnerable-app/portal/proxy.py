#!/usr/bin/env python3
"""
VulnCorp Lab 03 — Portal "PetaShop Inventory"

Servidor HTTP pequeño (solo stdlib) que corre en el puerto 9091 de la
máquina víctima y hace dos cosas:

  1. GET /            → landing corporativa amigable de PetaShop Inventory
  2. todo lo demás    → proxy transparente a la aplicación (127.0.0.1:9090),
                        incluyendo POST/multipart (carga de archivos)

Así los alumnos llegan a una página presentable y los módulos vulnerables
quedan a un click, sin tocar la aplicación vulnerable original.
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import os

PORTAL_PORT = int(os.environ.get("PORTAL_PORT", "9091"))
UPSTREAM = os.environ.get("UPSTREAM", "http://127.0.0.1:9090")

LANDING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "landing.html")

# Cabeceras prohibidas en el salto proxy (hop-by-hop)
HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
              "te", "trailers", "transfer-encoding", "upgrade", "host"}


class PortalHandler(http.server.BaseHTTPRequestHandler):
    server_version = "PetaShopInventory/3.0.0"

    # ------------------------------------------------------------------
    def _send_landing(self):
        try:
            with open(LANDING_FILE, "rb") as f:
                body = f.read()
        except OSError:
            body = b"<h1>PetaShop Inventory</h1><p><a href='/VulnerableApp/'>Consola</a></p>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ------------------------------------------------------------------
    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        req = urllib.request.Request(f"{UPSTREAM}{self.path}", data=body, headers=headers, method=self.command)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
        except urllib.error.HTTPError as err:
            resp = err
        except Exception:
            self.send_error(502, "El módulo de inventario no está disponible")
            return

        self.send_response(resp.status)
        for k, v in resp.headers.items():
            if k.lower() not in HOP_BY_HOP and k.lower() != "content-length":
                self.send_header(k, v)
        data = resp.read()
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ------------------------------------------------------------------
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send_landing()
        else:
            self._proxy()

    def do_HEAD(self):
        if self.path in ("/", "/index.html"):
            self._send_landing()
        else:
            self._proxy()

    def do_POST(self):
        self._proxy()

    def do_PUT(self):
        self._proxy()

    def do_DELETE(self):
        self._proxy()

    def do_OPTIONS(self):
        self._proxy()

    def log_message(self, fmt, *args):
        print(f"[portal] {self.address_string()} - {fmt % args}")


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    print(f"[portal] PetaShop Inventory portal escuchando en :{PORTAL_PORT} (upstream {UPSTREAM})")
    ThreadingServer(("0.0.0.0", PORTAL_PORT), PortalHandler).serve_forever()
