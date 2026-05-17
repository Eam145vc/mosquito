# file-server

HTTP server que sirve los `.bin` de audios y firmware que los speakers descargan via comandos MQTT `fvoice` y `fota`.

## Deploy en Railway

1. **Crear servicio nuevo** en el mismo proyecto del Mosquitto (NO uses el mismo repo de Mosquitto, este es otro servicio).
2. Subir esta carpeta a un repo de GitHub.
3. En Railway: New Service -> Deploy from GitHub repo.
4. Variables de entorno:
   - `UPLOAD_TOKEN` = un secreto largo para autorizar uploads (`openssl rand -hex 32`)
   - `STORAGE_PATH` = `/data` (donde se monta el volume)
5. Crear Volume:
   - Settings -> Volumes -> Mount path: `/data`
6. Exponer HTTP public domain:
   - Settings -> Networking -> Generate Domain -> elegir Public HTTP

## Test local

```bash
npm install
STORAGE_PATH=./_storage UPLOAD_TOKEN=test123 node server.js
```

```bash
# Subir un .bin
curl -X POST -H "Authorization: Bearer test123" \
  -F "file=@../../CLOUDSPEAKER_TOOLS/html/minifs_rom_v2.bin" \
  http://localhost:8080/v1/audio/spkr-001

# Descargar
curl -o /tmp/spkr-001.bin http://localhost:8080/v1/audio/spkr-001.bin
```

## Como lo usa el speaker

Backend manda al MQTT topic `speakers/spkr-001/cmd`:

```json
{"cmd":"fvoice","url":"http://qr-file-server-production.up.railway.app/v1/audio/spkr-001.bin","port":80}
```

El speaker descarga, flashea, reinicia y queda con audios nuevos.
