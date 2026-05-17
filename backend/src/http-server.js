// HTTP server con endpoints de onboarding OAuth2.
//
// GET  /                          - landing page con boton de login
// GET  /onboard?client=NAME       - inicia OAuth para un cliente dado
// GET  /auth/callback?code=...    - recibe code de Google y guarda token
// POST /test-voice                - manda voice de prueba al speaker (auth admin)
// GET  /accounts                  - lista accounts registrados (debug)

import Fastify from 'fastify';
import { config } from './config.js';
import { logger } from './logger.js';
import { buildAuthUrl, exchangeCodeForTokens } from './oauth.js';
import { upsertAccount, listAccounts, getAccount } from './storage.js';
import { publishVoice } from './mqtt-publisher.js';
import { buildVoiceMessage } from './amount-to-wavs.js';
import { handlePubSubPush } from './pubsub-handler.js';
import { watchInbox } from './gmail-api.js';
import { updateAccountHistory, updateAccountWatch } from './storage.js';

export function startHttp(onAccountAdded, onPaymentDetected) {
  const app = Fastify({ logger: false });

  app.get('/', async (req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>QR Announcer</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 3em auto; padding: 0 1em; color: #1a1a1a; line-height: 1.6; }
    h1 { color: #0a0; margin-bottom: 0.3em; }
    h2 { margin-top: 2em; }
    a.btn { display: inline-block; padding: 0.7em 1.4em; background: #4285f4; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
    a.btn:hover { background: #3367d6; }
    code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.95em; }
    .warn { background: #fff3cd; border: 1px solid #ffc107; padding: 1em 1.2em; border-radius: 6px; margin: 1em 0; }
    .warn b { color: #856404; }
    .step { display: flex; gap: 0.8em; align-items: flex-start; margin: 0.6em 0; }
    .num { background: #4285f4; color: white; border-radius: 50%; width: 1.6em; height: 1.6em; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; flex: 0 0 1.6em; }
  </style>
</head>
<body>
  <h1>QR Announcer</h1>
  <p>Sistema de anuncio de pagos QR por voz para tu negocio.</p>

  <h2>Conectar tu Gmail</h2>
  <p>Necesito leer las notificaciones de pago de tu banco. No veo tu password.</p>

  <div class="warn">
    <b>IMPORTANTE</b> — en la pantalla de Google que viene a continuacion:
    <div class="step"><span class="num">1</span><span><b>Selecciona tu cuenta</b> de Gmail</span></div>
    <div class="step"><span class="num">2</span><span><b>Aparece una alerta</b> "Google hasn't verified this app" — click <b>Advanced</b> -> <b>Go to (unsafe)</b>. Es normal porque la app esta en modo test.</span></div>
    <div class="step"><span class="num">3</span><span><b>Tilda el checkbox</b> "Read, compose, send, and permanently delete..." — sin tildarlo NO va a funcionar. (Aunque diga delete, el sistema solo lee).</span></div>
    <div class="step"><span class="num">4</span><span>Click <b>Continue</b></span></div>
  </div>

  <p><a class="btn" href="/onboard?client=demo">Conectar Gmail con Google</a></p>

  <hr style="margin: 3em 0; border: none; border-top: 1px solid #ddd">
  <p><small>Para clientes especificos: <code>/onboard?client=NOMBRE&speaker=spkr-XXX</code></small></p>
</body>
</html>`);
  });

  app.get('/onboard', async (req, reply) => {
    if (!config.hasOAuth) {
      return reply.code(500).send({ error: 'OAuth no configurado. Faltan GOOGLE_CLIENT_ID/SECRET' });
    }
    const clientInternalId = req.query.client || `c-${Date.now()}`;
    const speakerId = req.query.speaker || config.SPEAKER_DEVICE_ID;
    const url = buildAuthUrl({ clientInternalId, speakerId });
    return reply.redirect(url);
  });

  app.get('/auth/callback', async (req, reply) => {
    const { code, state, error } = req.query;
    if (error) {
      return reply.type('text/html').send(`<h1>Error</h1><p>${error}</p><a href="/">Volver</a>`);
    }
    if (!code) {
      return reply.code(400).send({ error: 'missing code' });
    }
    try {
      const decoded = decodeURIComponent(state || '');
      const [clientInternalId, speakerId] = decoded.split('|');

      const tokens = await exchangeCodeForTokens(code);
      logger.info({ id: clientInternalId, email: tokens.email, scopes: tokens.grantedScopes }, 'tokens received');

      upsertAccount({
        id: clientInternalId,
        email: tokens.email,
        refreshToken: tokens.refreshToken,
        speakerId,
      });

      // Si Pub/Sub esta configurado, llamar a watchInbox y guardar historyId
      if (config.GMAIL_PUBSUB_TOPIC) {
        try {
          const watchRes = await watchInbox(tokens.refreshToken);
          updateAccountHistory(clientInternalId, watchRes.historyId);
          updateAccountWatch(clientInternalId, watchRes.expiration);
          logger.info({ id: clientInternalId, historyId: watchRes.historyId, expires: watchRes.expiration }, 'gmail watch activo');
        } catch (e) {
          logger.error({ err: e.message }, 'watchInbox failed');
        }
      }

      // Notificar al main (en modo IMAP arranca ImapWatcher; en modo Pub/Sub no hace falta)
      if (onAccountAdded) {
        onAccountAdded({ id: clientInternalId, email: tokens.email, refreshToken: tokens.refreshToken, speakerId });
      }

      return reply.type('text/html').send(`<!DOCTYPE html>
<html><body style="font-family: system-ui; max-width: 720px; margin: 4em auto; padding: 1em; line-height: 1.6">
  <h1 style="color: #0a0">Cuenta conectada</h1>
  <p>Gracias <strong>${tokens.email}</strong>! Ya estoy escuchando tus correos.</p>
  <p>Cuando llegue una notificacion de pago de tu banco, el speaker la va a anunciar.</p>
  <p>Speaker asociado: <code>${speakerId}</code></p>
  <p><a href="/">Volver</a></p>
</body></html>`);
    } catch (e) {
      logger.error({ err: e.message }, 'callback failed');

      // Mensajes amigables segun el tipo de error
      let title = 'Error';
      let body = '';
      if (e.message.startsWith('SCOPE_MISSING')) {
        title = 'Falto tildar el checkbox';
        body = `<p>En la pantalla de Google necesitabas <b>tildar el checkbox</b>
                "Read, compose, send..." antes de clickear Continue.</p>
                <p>Por seguridad Google no permite que nosotros marquemos esa casilla por vos.
                Aunque dice "delete", el sistema solo lee — nunca escribe ni borra.</p>
                <p><b>Antes de reintentar:</b></p>
                <ol>
                  <li>Revoca el acceso anterior en
                    <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>
                  </li>
                  <li>Volve a la pagina principal y clickea de nuevo</li>
                  <li><b>TILDA el checkbox</b> esta vez</li>
                </ol>`;
      } else if (e.message.startsWith('NO_REFRESH_TOKEN')) {
        title = 'Faltan permisos';
        body = `<p>Google no devolvio el token completo (probablemente ya autorizaste
                la app antes con otros scopes).</p>
                <p><b>Solucion:</b></p>
                <ol>
                  <li>Anda a <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a></li>
                  <li>Busca <code>mosquito</code> o <code>qr-announcer</code> -> Remove access</li>
                  <li>Volve a hacer onboarding aqui</li>
                </ol>`;
      } else {
        body = `<pre style="background: #f0f0f0; padding: 1em; border-radius: 4px; overflow-x: auto">${e.message}</pre>`;
      }

      return reply.code(400).type('text/html').send(`<!DOCTYPE html>
<html><body style="font-family: system-ui; max-width: 720px; margin: 4em auto; padding: 1em; line-height: 1.6">
  <h1 style="color: #c00">${title}</h1>
  ${body}
  <p style="margin-top: 2em"><a href="/" style="display:inline-block; padding: 0.6em 1.2em; background: #4285f4; color: white; text-decoration: none; border-radius: 6px">Volver e intentar de nuevo</a></p>
</body></html>`);
    }
  });

  app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString() }));

  app.get('/accounts', async (req, reply) => {
    return listAccounts();
  });

  // Webhook de Pub/Sub - Gmail empuja notificaciones aca
  app.post('/webhook/gmail', async (req, reply) => {
    // Validacion opcional con token compartido
    if (config.PUBSUB_VERIFICATION_TOKEN) {
      const token = req.query.token || req.headers['x-pubsub-token'];
      if (token !== config.PUBSUB_VERIFICATION_TOKEN) {
        return reply.code(401).send({ error: 'invalid token' });
      }
    }
    // Devolver 2xx YA para que Pub/Sub no retransmita
    reply.code(204).send();
    // Procesar en background
    setImmediate(async () => {
      try {
        await handlePubSubPush(req.body, (payment) => {
          // Emitir al main via emit callback inyectado
          if (onPaymentDetected) onPaymentDetected(payment);
        });
      } catch (e) {
        logger.error({ err: e.message }, 'pubsub handler error');
      }
    });
  });

  // Test voice (manda algo al speaker)
  app.post('/test-voice', async (req, reply) => {
    const { amount, bank } = req.body || {};
    const playAudibleMsg = buildVoiceMessage({ amount: Number(amount) || 5000, bank });
    await publishVoice(playAudibleMsg, { amount });
    return { ok: true, playAudibleMsg };
  });

  app.listen({ port: config.HTTP_PORT, host: config.HTTP_HOST })
    .then(() => logger.info({ port: config.HTTP_PORT }, 'http server listening'))
    .catch(e => { logger.error({ err: e.message }, 'http listen fail'); process.exit(1); });

  return app;
}
