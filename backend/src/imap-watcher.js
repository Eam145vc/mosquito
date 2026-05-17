// Vigila el INBOX de Gmail por IMAP IDLE + polling fallback.
// Procesa solo mensajes UNSEEN (no leidos) y los marca como leidos despues
// para evitar duplicados.

import { EventEmitter } from 'node:events';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from './config.js';
import { logger } from './logger.js';
import { parseEmail } from './parsers/index.js';
import { isDuplicate } from './dedupe.js';
import { refreshAccessToken } from './oauth.js';

const POLL_INTERVAL_MS = 3000;   // poll agresivo cada 3s para latencia minima

export class ImapWatcher extends EventEmitter {
  constructor({ id, email, refreshToken, speakerId }) {
    super();
    this.id = id;
    this.email = email;
    this.refreshToken = refreshToken;
    this.speakerId = speakerId || config.SPEAKER_DEVICE_ID;
    this.client = null;
    this._stopping = false;
    this._pollTimer = null;
    this._processing = false;
    this._lastUid = 0;
  }

  async _getAccessToken() {
    const { accessToken } = await refreshAccessToken(this.refreshToken);
    return accessToken;
  }

  async start() {
    if (this._stopping) return;

    const accessToken = await this._getAccessToken();

    this.client = new ImapFlow({
      host: config.IMAP_HOST,
      port: config.IMAP_PORT,
      secure: true,
      auth: { user: this.email, accessToken },
      logger: {
        trace: () => {}, debug: () => {}, info: () => {},
        warn: (o) => logger.warn({ ...o, id: this.id }, 'imap'),
        error: (o) => logger.error({ ...o, id: this.id }, 'imap'),
      },
    });

    this.client.on('error', (err) => logger.error({ id: this.id, err: err.message }, 'imap error'));
    this.client.on('close', () => {
      if (this._stopping) return;
      logger.warn({ id: this.id }, 'imap closed, restarting in 5s');
      this._stopPolling();
      setTimeout(() => this.start().catch(e => logger.error({ id: this.id, err: e.message }, 'imap restart fail')), 5000);
    });

    await this.client.connect();
    logger.info({ id: this.id, email: this.email }, 'imap connected');

    await this.client.mailboxOpen('INBOX', { readOnly: false });
    logger.info({ id: this.id }, 'imap INBOX opened');

    // Inicializar lastUid con el UID actual mas alto, asi no reprocesamos viejos
    try {
      const status = await this.client.status('INBOX', { uidNext: true });
      this._lastUid = (status.uidNext || 1) - 1;
      logger.info({ id: this.id, lastUid: this._lastUid }, 'imap starting from current UID');
    } catch {}

    // Evento 'exists' = IDLE detecto cambios (notificacion push de Gmail)
    this.client.on('exists', async () => {
      if (this._stopping) return;
      this._scan('idle');
    });

    // IDLE en loop
    this._idleLoop();

    // Polling fallback cada 8s
    this._startPolling();
  }

  async _idleLoop() {
    while (!this._stopping && this.client) {
      try {
        await this.client.idle();
      } catch (e) {
        if (this._stopping) break;
        logger.warn({ id: this.id, err: e.message }, 'imap idle interrupted');
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._scan('poll'), POLL_INTERVAL_MS);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _scan(trigger) {
    if (this._processing || this._stopping || !this.client) return;
    this._processing = true;
    const t0 = Date.now();

    try {
      // Buscar mensajes con UID > lastUid (mas rapido que filtrar UNSEEN despues)
      const range = `${this._lastUid + 1}:*`;
      let count = 0;
      let maxUid = this._lastUid;

      for await (const msg of this.client.fetch(range, { source: true, envelope: true, uid: true }, { uid: true })) {
        if (msg.uid <= this._lastUid) continue; // safety
        maxUid = Math.max(maxUid, msg.uid);
        await this.handleMessage(msg);
        count++;
      }

      if (maxUid > this._lastUid) this._lastUid = maxUid;

      if (count > 0) {
        logger.info({ id: this.id, trigger, count, lastUid: this._lastUid, dur_ms: Date.now() - t0 }, 'scan done');
      }
    } catch (e) {
      logger.error({ id: this.id, trigger, err: e.message }, 'scan failed');
    } finally {
      this._processing = false;
    }
  }

  async handleMessage(msg) {
    try {
      const parsed = await simpleParser(msg.source);
      const messageId = parsed.messageId || msg.envelope?.messageId;
      if (isDuplicate(`${this.id}:${messageId || msg.uid}`)) return;

      const fromAddr = (parsed.from?.value?.[0]?.address || '').toLowerCase();
      const subject = parsed.subject || '';

      if (config.allowedSenders.length > 0) {
        const ok = config.allowedSenders.some(s => fromAddr.includes(s));
        if (!ok) return;
      }

      const result = parseEmail({ from: fromAddr, subject, text: parsed.text, html: parsed.html });
      if (!result) return;

      logger.info({ id: this.id, uid: msg.uid, fromAddr, subject, ...result }, 'payment detected');
      this.emit('payment', { ...result, speakerId: this.speakerId, messageId, from: fromAddr, subject });
    } catch (e) {
      logger.error({ id: this.id, err: e.message }, 'handleMessage failed');
    }
  }

  async stop() {
    this._stopping = true;
    this._stopPolling();
    if (this.client) {
      try { await this.client.logout(); } catch {}
      this.client = null;
    }
  }
}
