# qr-speaker-infra

Infraestructura del sistema de anuncio de pagos QR por voz.

## Servicios

| Carpeta | Servicio | Que hace |
|---------|----------|----------|
| [mosquitto-svc/](mosquitto-svc/) | MQTT Broker | Recibe comandos del backend y los entrega a los speakers via 4G |
| [file-server/](file-server/) | HTTP File Server | Sirve `.bin` de audios y firmware OTA a los speakers |

## Como deployar en Railway

Ambos servicios viven en el mismo Railway project pero son **servicios separados**:

### Servicio mosquitto (ya existe)

- En Railway: el servicio actual "mosquito"
- Settings -> **Root Directory**: cambiar a `mosquitto-svc`
- Vars:
  - `ANNOUNCER_PASSWORD`
  - `SPEAKER_001_PASSWORD`
- Networking: TCP Proxy -> port 1883 -> ya expuesto en `maglev.proxy.rlwy.net:36922`

### Servicio file-server (nuevo)

- Railway: New Service -> Deploy from GitHub repo -> mismo repo `mosquito`
- Settings -> **Root Directory**: `file-server`
- Settings -> **Volumes**: nuevo volume montado en `/data`
- Vars:
  - `UPLOAD_TOKEN` = un secreto (`openssl rand -hex 32`)
  - `STORAGE_PATH` = `/data`
- Networking: **Public HTTP** (no TCP) -> port 8080

Despues de deployar, el endpoint queda algo tipo
`https://qr-speaker-fileserver-production.up.railway.app/v1/audio/spkr-001.bin`

## Flujo de OTA de audios

```
1. Generamos pack de WAVs espanol colombiano (audio-pack/)
2. Empaquetamos con cloudspeaker_tools -> minifs_rom_v2.bin
3. POST al file-server con bearer token -> /v1/audio/spkr-001.bin
4. MQTT publish a speakers/spkr-001/cmd:
   {"cmd":"fvoice", "url":"http://...railway.app/v1/audio/spkr-001.bin", "port":80}
5. Speaker descarga via 4G, flashea, reinicia
6. Speaker dice los audios nuevos
```
