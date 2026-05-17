// Entrypoint del backend.
// Soporta dos modos en paralelo:
//   - IMAP IDLE (fallback, latencia 5-15s)
//   - Gmail API + Pub/Sub webhook (modo realtime, <3s) - se activa si GMAIL_PUBSUB_TOPIC esta seteado

import { ImapWatcher } from './imap-watcher.js';
import { publishVoice, connect as mqttConnect, close as mqttClose } from './mqtt-publisher.js';
import { buildVoiceMessage } from './amount-to-wavs.js';
import { startHttp } from './http-server.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { openDb, listAccounts, getAccount } from './storage.js';
import { watchInbox } from './gmail-api.js';
import { updateAccountHistory, updateAccountWatch } from './storage.js';

const watchers = new Map();   // id -> ImapWatcher (modo IMAP)

async function announcePayment(payment) {
  try {
    const playAudibleMsg = buildVoiceMessage({
      amount: payment.amount,
      bank: payment.bank,
      includeBank: true,
    });
    logger.info({ playAudibleMsg, speakerId: payment.speakerId, ...payment }, 'announcing payment');
    await publishVoice(playAudibleMsg, { amount: payment.amount, speakerId: payment.speakerId });
  } catch (e) {
    logger.error({ err: e.message }, 'announce failed');
  }
}

async function startImapWatcher({ id, email, refreshToken, speakerId }) {
  if (watchers.has(id)) return;
  const w = new ImapWatcher({ id, email, refreshToken, speakerId });
  w.on('payment', announcePayment);
  try {
    await w.start();
    watchers.set(id, w);
  } catch (e) {
    logger.error({ id, err: e.message }, 'watcher failed to start');
  }
}

async function renewWatchIfNeeded(account) {
  // Renovar si expira en menos de 24h
  if (!account.watch_expires || account.watch_expires - Date.now() < 24 * 3600 * 1000) {
    try {
      const w = await watchInbox(account.refreshToken);
      updateAccountHistory(account.id, w.historyId);
      updateAccountWatch(account.id, w.expiration);
      logger.info({ id: account.id, historyId: w.historyId }, 'gmail watch renewed');
    } catch (e) {
      logger.error({ id: account.id, err: e.message }, 'watch renewal failed');
    }
  }
}

async function main() {
  const usingPubSub = Boolean(config.GMAIL_PUBSUB_TOPIC);
  logger.info({ mode: usingPubSub ? 'PubSub' : 'IMAP' }, 'starting backend');
  openDb();
  mqttConnect();

  const accounts = listAccounts();
  logger.info({ count: accounts.length, mode: usingPubSub ? 'PubSub' : 'IMAP' }, 'accounts en DB');

  for (const a of accounts) {
    const full = getAccount(a.id);
    if (!full) continue;

    if (usingPubSub) {
      // Renovar watch si hace falta
      await renewWatchIfNeeded(full);
    } else {
      // Fallback IMAP IDLE
      await startImapWatcher({
        id: full.id, email: full.email,
        refreshToken: full.refreshToken, speakerId: full.speaker_id,
      });
    }
  }

  // HTTP server con callback OAuth y webhook Pub/Sub
  startHttp(
    async ({ id, email, refreshToken, speakerId }) => {
      if (!usingPubSub) {
        await startImapWatcher({ id, email, refreshToken, speakerId });
      }
      // En modo Pub/Sub, watchInbox ya se llamo dentro del callback de OAuth
    },
    announcePayment   // callback para que el webhook anuncie pagos
  );

  // Renovar watches cada 12h (Google expira a 7 dias)
  if (usingPubSub) {
    setInterval(async () => {
      for (const a of listAccounts()) {
        const full = getAccount(a.id);
        if (full) await renewWatchIfNeeded(full);
      }
    }, 12 * 3600 * 1000);
  }

  const shutdown = async () => {
    logger.info('shutting down...');
    for (const w of watchers.values()) await w.stop();
    mqttClose();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(e => {
  logger.error({ err: e.message, stack: e.stack }, 'fatal');
  process.exit(1);
});
