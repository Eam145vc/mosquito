// HTTP file server para los .bin de audio (minifs_rom_v2.bin) y firmware (flashimage-ota.bin)
// que los speakers descargan via comando MQTT "fvoice" o "fota".
//
// Endpoints:
//   GET  /v1/firmware/:device.bin  -> sirve firmware OTA del speaker
//   GET  /v1/audio/:device.bin     -> sirve pack de audios del speaker
//   POST /v1/audio/:device         -> sube nuevo pack de audios (auth con UPLOAD_TOKEN)
//   GET  /healthz                  -> healthcheck
//
// Variables de entorno:
//   PORT             - puerto HTTP (default 8080)
//   STORAGE_PATH     - directorio persistente (default /data) - en Railway esto es un Volume montado
//   UPLOAD_TOKEN     - bearer token para subir archivos. Si vacio: uploads deshabilitados.

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const STORAGE_PATH = process.env.STORAGE_PATH || '/data';
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || '';

const AUDIO_DIR = path.join(STORAGE_PATH, 'audio');
const FW_DIR = path.join(STORAGE_PATH, 'firmware');

await fs.mkdir(AUDIO_DIR, { recursive: true });
await fs.mkdir(FW_DIR, { recursive: true });

const app = Fastify({
  logger: {
    level: 'info',
    transport: { target: 'pino-pretty', options: { colorize: false } },
  },
  bodyLimit: 5 * 1024 * 1024, // 5 MB
});

await app.register(fastifyMultipart, {
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Healthcheck
app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString() }));

// Listar audios disponibles (debug)
app.get('/v1/audio', async () => {
  const files = await fs.readdir(AUDIO_DIR).catch(() => []);
  return { audios: files };
});

// Descargar audio del speaker
app.get('/v1/audio/:filename', async (req, reply) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_-]+\.bin$/.test(filename)) {
    return reply.code(400).send({ error: 'invalid filename' });
  }
  const fp = path.join(AUDIO_DIR, filename);
  try {
    const stat = await fs.stat(fp);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', stat.size);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(await fs.readFile(fp));
  } catch (e) {
    return reply.code(404).send({ error: 'not found' });
  }
});

// Subir audio (auth con token)
app.post('/v1/audio/:device', async (req, reply) => {
  if (!UPLOAD_TOKEN) return reply.code(503).send({ error: 'uploads disabled' });
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${UPLOAD_TOKEN}`) return reply.code(401).send({ error: 'unauthorized' });

  const device = req.params.device;
  if (!/^[a-zA-Z0-9_-]+$/.test(device)) {
    return reply.code(400).send({ error: 'invalid device id' });
  }

  const file = await req.file();
  if (!file) return reply.code(400).send({ error: 'no file' });

  const buf = await file.toBuffer();
  if (buf.length > 5 * 1024 * 1024) return reply.code(413).send({ error: 'too large' });

  // Validar magic header del minifs_rom_v2.bin
  const magic = buf.subarray(0, 9).toString('ascii');
  if (magic !== 'M0-MINIFS') {
    return reply.code(400).send({ error: 'not a valid minifs_rom_v2.bin', got_magic: magic });
  }

  const outPath = path.join(AUDIO_DIR, `${device}.bin`);
  await fs.writeFile(outPath, buf);
  return { ok: true, device, bytes: buf.length, path: `/v1/audio/${device}.bin` };
});

// Firmware (mismo patron que audio)
app.get('/v1/firmware/:filename', async (req, reply) => {
  const filename = req.params.filename;
  if (!/^[a-zA-Z0-9_-]+\.bin$/.test(filename)) {
    return reply.code(400).send({ error: 'invalid filename' });
  }
  const fp = path.join(FW_DIR, filename);
  try {
    const stat = await fs.stat(fp);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', stat.size);
    return reply.send(await fs.readFile(fp));
  } catch {
    return reply.code(404).send({ error: 'not found' });
  }
});

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`file-server listo en :${PORT}, storage=${STORAGE_PATH}`);
