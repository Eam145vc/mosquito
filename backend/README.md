# Backend qr-announcer

Lee emails de notificacion de pagos por IMAP IDLE, parsea monto y banco, y
publica via MQTT al speaker para anunciar el pago por voz.

## Como correr local

```bash
npm install
cp .env.example .env   # editar con tus creds
node --env-file=.env src/index.js
```

## Tests

```bash
npm test
```

## Setup Gmail (App Password)

1. Activar 2FA en la cuenta: https://myaccount.google.com/signinoptions/two-step-verification
2. Generar App Password: https://myaccount.google.com/apppasswords
3. Pegar la app password (16 caracteres) en `IMAP_PASSWORD`

## Probar un email manualmente (sin esperar pago real)

Envia un email de prueba al Gmail configurado con el body:

```
Recibiste una transferencia por $5.000 de PEDRO PEREZ
```

con From simulando ser Bancolombia (o cualquier banco soportado).

## Arquitectura

```
Gmail INBOX (IMAP IDLE)
   |
   v
imap-watcher.js     <-- lee emails nuevos
   |
   v
parsers/*           <-- detecta banco + extrae monto
   |
   v (event 'payment')
index.js
   |
   v
amount-to-wavs.js   <-- monto -> secuencia de IDs WAV
   |
   v
mqtt-publisher.js   <-- publica {cmd: voice, playAudibleMsg: "..."}
   |
   v
Mosquitto Railway
   |
   v
Speaker -> habla en espanol colombiano
```
