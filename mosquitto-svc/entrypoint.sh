#!/bin/sh
# entrypoint genera el password_file a partir de env vars en cada arranque.
# Esto permite rotar passwords desde Railway sin reconstruir la imagen.
#
# Env vars esperadas (configuralas en el dashboard de Railway):
#   ANNOUNCER_PASSWORD     -> password del backend
#   SPEAKER_001_PASSWORD   -> password del primer speaker (4G prototipo)
#   SPEAKER_002_PASSWORD   -> password del segundo speaker (WiFi primer lote)
#
# Para agregar mas speakers: agregar SPEAKER_NNN_PASSWORD env + bloque user en el ACL.

set -e

PASSWD_FILE=/mosquitto/config/passwd

if [ -z "$ANNOUNCER_PASSWORD" ]; then
  echo "[entrypoint] ERROR: ANNOUNCER_PASSWORD env var no esta seteada"
  exit 1
fi
if [ -z "$SPEAKER_001_PASSWORD" ]; then
  echo "[entrypoint] ERROR: SPEAKER_001_PASSWORD env var no esta seteada"
  exit 1
fi

# Empezamos limpio
: > "$PASSWD_FILE"

# mosquitto_passwd -b agrega user/pass al archivo (formato propio hasheado)
mosquitto_passwd -b "$PASSWD_FILE" announcer "$ANNOUNCER_PASSWORD"
mosquitto_passwd -b "$PASSWD_FILE" spkr-001 "$SPEAKER_001_PASSWORD"

# Speaker 002 (opcional, se agrega si la env var existe)
if [ -n "$SPEAKER_002_PASSWORD" ]; then
  mosquitto_passwd -b "$PASSWD_FILE" spkr-002 "$SPEAKER_002_PASSWORD"
  USERS_LIST="announcer, spkr-001, spkr-002"
else
  USERS_LIST="announcer, spkr-001"
fi

chmod 0700 "$PASSWD_FILE"

echo "[entrypoint] passwd_file generado con usuarios: $USERS_LIST"
echo "[entrypoint] arrancando Mosquitto..."

exec "$@"
