# Setup OAuth2 para Gmail IMAP

## Paso 1 — Crear proyecto en Google Cloud

1. Abrí https://console.cloud.google.com/
2. Login con tu Google (puede ser el mismo que vas a usar para pruebas)
3. Click en el dropdown de proyecto arriba → **New Project**
4. Nombre: `qr-announcer` → Create
5. Asegurate que el dropdown ahora muestre el proyecto nuevo

## Paso 2 — Activar Gmail API

1. En el menú izquierdo: **APIs & Services** → **Library**
2. Buscá `Gmail API` → click → **Enable**

## Paso 3 — Configurar OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → Create
3. App information:
   - App name: `QR Announcer`
   - User support email: tu email
   - App logo: opcional
4. App domain (opcional para desarrollo)
5. Developer contact: tu email
6. Save and Continue
7. **Scopes** → Add or Remove Scopes:
   - Buscá `https://mail.google.com/` y tildalo
   - Save
8. **Test users** → Add Users:
   - Agregá tu email Gmail
   - Cualquier otro email de prueba (el del dueño del negocio en pruebas)
   - **Importante**: hasta que la app esté "verificada" por Google solo los test users pueden usarla. Para 10-20 usuarios de prueba alcanza.
9. Save

## Paso 4 — Crear OAuth Client ID

1. **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `qr-announcer-backend`
5. Authorized redirect URIs → **+ Add URI**:
   - `http://localhost:3000/auth/callback`
   - (Más adelante agregás la URL de Railway en produccion)
6. Create

## Paso 5 — Anotar credenciales

Te aparece un popup con:
- **Client ID** (algo tipo `123456789-abcdef.apps.googleusercontent.com`)
- **Client Secret** (algo tipo `GOCSPX-xxxxxx`)

Pasame ambos para configurar el backend.

## Después: el flujo del cliente

Cuando un cliente quiera onboardearse:

1. Vos le mandás un magic link: `http://localhost:3000/onboard?client=DonJuan`
2. El cliente abre el link → backend genera URL OAuth de Google
3. Cliente acepta en Google → "Sí, qr-announcer puede leer mi Gmail"
4. Google redirecciona a `http://localhost:3000/auth/callback?code=xxx`
5. Backend intercambia code por refresh_token
6. Backend guarda refresh_token encriptado, asociado a ese cliente
7. Backend arranca IMAP IDLE para ese cliente

## Renovación automatica

El access_token dura 1h pero el refresh_token dura años (hasta que el cliente
revoca acceso en https://myaccount.google.com/permissions).

Antes de cada operacion IMAP el backend hace:
```
POST https://oauth2.googleapis.com/token
  client_id, client_secret, refresh_token, grant_type=refresh_token
```
Recibe un access_token nuevo, lo usa con IMAP via XOAUTH2.

## Limites a tener en cuenta

- **Test users**: máximo 100 antes de pedir verificación a Google.
- **Verificación de Google**: para producción real (>100 usuarios o sin "esto es un test")
  hay que pedir verificación. Toma 4-8 semanas si el scope es `mail.google.com`
  (es scope "restricted"). Para arrancar el MVP, el modo "Testing" con 100 users alcanza.
- Si querés evitar la verificación: scope `gmail.readonly` es "sensitive" no "restricted"
  y se aprueba más rapido. Para nuestro caso solo lectura alcanza.
