# Mosquitto para qr-announcer en Railway

Broker MQTT con autenticacion username/password. Sin TLS (MQTT plano puerto 1883).
Para produccion seria, agregar TLS termination (ver seccion al final).

## Como deployar

1. **Push** este directorio completo a un repo de GitHub.
2. En Railway: **New Project** -> **Deploy from GitHub repo** -> elegir el repo.
3. Railway detecta el `Dockerfile` automaticamente. Si esta en subcarpeta, en
   Settings -> **Root Directory** poner `qr-announcer/mosquitto`.
4. En **Variables** del servicio, agregar:
   - `ANNOUNCER_PASSWORD` = una password fuerte (>= 24 chars). Ejemplo:
     `openssl rand -base64 24`
   - `SPEAKER_001_PASSWORD` = otra password fuerte distinta
5. En **Settings -> Networking** clickear **Generate Domain** > **TCP Proxy**.
   Railway te asigna un host:port publico, algo tipo
   `tramway.proxy.rlwy.net:34521`. Anotalo, lo usamos en el speaker.
6. Deploy. El log deberia decir `[entrypoint] passwd_file generado...` y luego
   `mosquitto version 2.0.x running`.

## Como probar desde tu PC

Instalar mosquitto client (Windows: `winget install EclipseFoundation.Mosquitto`).

```bash
# Suscribirse al topic del speaker (deberia mostrar getinfo cuando el speaker se conecte)
mosquitto_sub -h tramway.proxy.rlwy.net -p 34521 \
  -u announcer -P $ANNOUNCER_PASSWORD \
  -t 'speakers/+/status' -v

# En otra terminal, publicar comando voice
mosquitto_pub -h tramway.proxy.rlwy.net -p 34521 \
  -u announcer -P $ANNOUNCER_PASSWORD \
  -t 'speakers/spkr-001/cmd' \
  -m '{"cmd":"voice","playAudibleMsg":"037-038-039"}'
```

## Como agregar mas speakers

1. Editar `acl`, agregar bloque:
   ```
   user spkr-NNN
   topic read speakers/spkr-NNN/cmd
   topic write speakers/spkr-NNN/status
   ```
2. Editar `entrypoint.sh`, agregar:
   ```sh
   mosquitto_passwd -b "$PASSWD_FILE" spkr-NNN "$SPEAKER_NNN_PASSWORD"
   ```
3. En Railway, agregar env var `SPEAKER_NNN_PASSWORD`.
4. Redeploy.

(Esto lo automatizamos despues con el panel admin.)

## Migrar a TLS (cuando el speaker funcione end-to-end)

3 opciones:
- **Caddy sidecar:** un container Caddy delante de Mosquitto, terminacion TLS con
  cert auto-renovado por Let's Encrypt. Requiere dominio propio apuntando al
  Railway TCP proxy via CNAME.
- **Cert self-signed dentro del container:** mas simple pero el speaker debe
  aceptar self-signed (muchos firmwares chinos lo hacen).
- **Stunnel sidecar:** similar a Caddy pero mas viejo y especifico para TCP.

Ver `mosquitto.conf.tls.example` cuando se implemente.
