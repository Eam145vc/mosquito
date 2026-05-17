# qr-speaker-infra

Sistema completo de anuncio de pagos QR por voz para Colombia.
Lee notificaciones de bancos por Gmail (OAuth2), parsea monto + banco, y anuncia
por MQTT al speaker IoT del local del cliente.

## Servicios

| Carpeta | Servicio Railway | Que hace |
|---------|------------------|----------|
| [mosquitto-svc/](mosquitto-svc/) | **mosquito** | MQTT Broker (Mosquitto 2.0) entre backend y speakers |
| [file-server/](file-server/) | **file-server** | HTTP server que sirve `.bin` de audios para OTA via fvoice |
| [backend/](backend/) | **backend** | OAuth2 Gmail + IMAP/Pub/Sub watcher + parsers banco + MQTT publisher |

## Deploy en Railway (un proyecto, tres servicios)

Cada servicio es un Railway Service en el mismo proyecto. Cada uno apunta al
mismo repo pero con `Root Directory` distinto (en Settings -> Source).

### 1. mosquitto-svc (broker MQTT)

- Root Directory: `mosquitto-svc`
- Variables: `ANNOUNCER_PASSWORD`, `SPEAKER_001_PASSWORD`
- Networking: TCP Proxy en port 1883
- Ya online en `maglev.proxy.rlwy.net:36922`

### 2. file-server (OTA de audios)

- Root Directory: `file-server`
- Variables: `UPLOAD_TOKEN`, `STORAGE_PATH=/data`
- Volume montado en `/data`
- HTTP Public + TCP Proxy (puerto 8080)
- Ya online

### 3. backend (Gmail watcher + MQTT publisher)

- Root Directory: `backend`
- Variables: ver `backend/.env.example`
- Volume montado en `/app/_data` (para la SQLite)
- HTTP Public (necesita HTTPS publico para OAuth callback + Pub/Sub webhook)
- Documentacion completa en [backend/README.md](backend/README.md) y
  [backend/GMAIL_OAUTH_SETUP.md](backend/GMAIL_OAUTH_SETUP.md)

## Flujo completo

```
Banco/Billetera (Bancolombia/Nequi/Daviplata/...)
        |
        v  notificacion por mail
Gmail del cliente
        |
        v  Gmail API + Pub/Sub push (latencia <3s)
        v  o IMAP IDLE + poll 3s (fallback)
backend/src/imap-watcher.js  +  backend/src/pubsub-handler.js
        |
        v  parsers/bancolombia, nequi, daviplata, davivienda, generic
backend/src/amount-to-wavs.js  (numero -> secuencia de IDs WAV)
        |
        v  MQTT publish
mosquitto-svc (Mosquitto en Railway)
        |
        v  4G LTE-M
Speaker IoT en el local
        |
        v  reproduce
"Recibiste cinco mil pesos de Bancolombia"  (espanol colombiano)
```

## Onboarding de un cliente

1. Vos le mandas el magic link: `https://backend.up.railway.app/onboard?client=DonJuan`
2. Cliente acepta consent screen de Google (tilda checkbox de Gmail)
3. Backend recibe `code`, intercambia por `refresh_token`, lo guarda cifrado AES-256
4. Backend llama `users.watch()` para suscribir su INBOX al topic Pub/Sub
5. A partir de ese momento, cualquier email de banco se anuncia en su speaker en <3s
