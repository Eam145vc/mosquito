#!/bin/sh
# entrypoint genera el password_file a partir de env vars en cada arranque.
# Esto permite rotar passwords desde Railway sin reconstruir la imagen.
#
# Env vars esperadas (configuralas en el dashboard de Railway):
#   ANNOUNCER_PASSWORD     -> password del backend
#   SPEAKER_001_PASSWORD   -> password del primer speaker
#
# Para agregar mas speakers: definir SPEAKER_NNN_PASSWORD aca y SPEAKER_NNN_USER
# en el ACL.

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

chmod 0700 "$PASSWD_FILE"

echo "[entrypoint] passwd_file generado con usuarios: announcer, spkr-001"
echo "[entrypoint] arrancando Mosquitto..."

exec "$@"
