// Cliente MQTT que publica comandos voice al speaker.
// Soporta multiples speakers: el topic se calcula del speakerId que viene
// en cada publishVoice().

import mqtt from 'mqtt';
import { config } from './config.js';
import { logger } from './logger.js';

let client = null;

export function connect() {
  if (client) return client;

  logger.info({ url: config.MQTT_URL }, 'mqtt connecting');
  client = mqtt.connect(config.MQTT_URL, {
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
    clientId: `announcer-${Math.random().toString(16).slice(2, 8)}`,
  });

  client.on('connect', () => logger.info('mqtt connected'));
  client.on('error', (err) => logger.error({ err: err.message }, 'mqtt error'));
  client.on('offline', () => logger.warn('mqtt offline'));
  client.on('reconnect', () => logger.info('mqtt reconnecting'));

  return client;
}

/**
 * @param {string} playAudibleMsg
 * @param {Object} [opts]
 * @param {number} [opts.amount]
 * @param {string} [opts.speakerId]  - default config.SPEAKER_DEVICE_ID
 */
export async function publishVoice(playAudibleMsg, opts = {}) {
  const c = connect();
  if (!c.connected) {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('mqtt connect timeout 10s')), 10_000);
      c.once('connect', () => { clearTimeout(t); res(); });
      c.once('error', (err) => { clearTimeout(t); rej(err); });
    });
  }

  const payload = { cmd: 'voice', playAudibleMsg };
  if (opts.amount != null) payload.amount = String(opts.amount).slice(0, 8);

  const speakerId = opts.speakerId || config.SPEAKER_DEVICE_ID;
  const topic = `speakers/${speakerId}/cmd`;

  logger.info({ topic, payload }, 'mqtt publish voice');

  return new Promise((res, rej) => {
    c.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) return rej(err);
      res();
    });
  });
}

export function close() {
  if (client) {
    client.end();
    client = null;
  }
}
