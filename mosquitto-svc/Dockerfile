FROM eclipse-mosquitto:2.0

COPY mosquitto.conf /mosquitto/config/mosquitto.conf
COPY acl /mosquitto/config/acl
COPY passwd /mosquitto/config/passwd
COPY entrypoint.sh /entrypoint.sh

USER root
RUN chmod 0700 /mosquitto/config/passwd \
 && chmod 0700 /mosquitto/config/acl \
 && chown mosquitto:mosquitto /mosquitto/config/passwd /mosquitto/config/acl \
 && chmod +x /entrypoint.sh

USER mosquitto

EXPOSE 1883

ENTRYPOINT ["/entrypoint.sh"]
CMD ["mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
