// Configuracion del backend, validada con Zod.
import { z } from 'zod';

const ConfigSchema = z.object({
  // ---- MQTT ----
  MQTT_URL: z.string().min(1),
  MQTT_USERNAME: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),

  // ---- IMAP server ----
  IMAP_HOST: z.string().default('imap.gmail.com'),
  IMAP_PORT: z.coerce.number().int().default(993),

  // ---- OAuth2 Google ----
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:3000/auth/callback'),

  // ---- Storage encryption ----
  // 32 bytes base64 para AES-256-GCM. Generalo con: openssl rand -base64 32
  ENCRYPTION_KEY: z.string().min(32).optional(),
  DB_PATH: z.string().default('./_data/db.sqlite'),

  // ---- HTTP server ----
  HTTP_PORT: z.coerce.number().int().default(3000),
  HTTP_HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),

  // ---- Default speaker (modo single-tenant para pruebas) ----
  // En multi-tenant cada cliente tiene su speaker; este es para el single-tenant.
  SPEAKER_DEVICE_ID: z.string().default('spkr-001'),

  // ---- Gmail API / Pub/Sub ----
  // topicName completo: projects/PROJECT_ID/topics/TOPIC_NAME
  GMAIL_PUBSUB_TOPIC: z.string().default(''),
  // Token compartido para verificar que las requests al webhook vienen de Pub/Sub
  PUBSUB_VERIFICATION_TOKEN: z.string().default(''),

  // ---- Allowlist de remitentes (csv) ----
  ALLOWED_SENDERS: z.string().default(''),

  LOG_LEVEL: z.enum(['trace','debug','info','warn','error']).default('info'),
});

const raw = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k in ConfigSchema.shape)
);

let parsed;
try {
  parsed = ConfigSchema.parse(raw);
} catch (e) {
  console.error('Config invalida:');
  console.error(JSON.stringify(e.errors || e, null, 2));
  process.exit(1);
}

parsed.allowedSenders = parsed.ALLOWED_SENDERS
  ? parsed.ALLOWED_SENDERS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : [];

parsed.mqttSubTopic = `speakers/${parsed.SPEAKER_DEVICE_ID}/cmd`;
parsed.mqttPubTopic = `speakers/${parsed.SPEAKER_DEVICE_ID}/status`;

// Helpers
parsed.hasOAuth = Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET);

export const config = parsed;
