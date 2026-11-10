###############################################################################
#  VulnCorp Lab 03 — "PetaShop Inventory" (máquina víctima)
#
#  Base: OWASP VulnerableApp (SasanLabs) — escenarios oficiales de
#  Command Injection y File Upload que los alumnos ya conocen del curso.
#
#  Capas adicionales para el escenario del Lab 03:
#    - python3 + curl: requeridos para desplegar el agente Mythic (Medusa)
#    - /opt/petashop/: archivos "corporativos" de PetaShop, incluyendo el
#      documento de credenciales de bodega (FLAG) que el equipo debe
#      exfiltrar con el C2 y usar para documentar el proceso.
#    - /opt/portal/: portal corporativo amigable (landing en "/") con proxy
#      inverso transparente hacia la app vulnerable. El alumno ve una
#      página presentable y los módulos quedan a un click.
#
#  Puertos internos:  9090 = VulnerableApp | 9091 = portal (expuesto como 9090)
#
#  Multi-arquitectura: la imagen base sasanlabs/owasp-vulnerableapp:2.2.57
#  soporta amd64 y arm64.
###############################################################################

FROM sasanlabs/owasp-vulnerableapp:2.2.57

USER root

# python3: necesario para ejecutar el agente Medusa de Mythic en la víctima.
# curl: usado por el portal (healthcheck del upstream) y por el atacante.
# unzip + procps: herramientas típicas de post-explotación/investigación.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 curl unzip procps && \
    rm -rf /var/lib/apt/lists/*

# Archivos "corporativos" de PetaShop en la máquina víctima.
# El archivo de credenciales de bodega contiene la FLAG que los alumnos
# deben descubrir, descargar con Mythic y entregar como evidencia.
COPY files/ /opt/petashop/
RUN chmod 644 /opt/petashop/*

# Portal corporativo + script de arranque
COPY portal/ /opt/portal/
COPY start.sh /opt/portal/start.sh
# Normalizar fines de línea: si el repo se clonó en Windows con
# autocrlf, el shebang llega con \r y el exec falla con
# "no such file or directory". El sed lo deja siempre LF.
RUN sed -i 's/\r$//' /opt/portal/start.sh /opt/portal/proxy.py && \
    chmod +x /opt/portal/start.sh && chmod 644 /opt/portal/landing.html

USER 1000

# El contenedor expone el portal (9091); la app vulnerable queda interna (9090)
EXPOSE 9091
ENTRYPOINT ["/opt/portal/start.sh"]
