FROM postgres:17-bookworm
COPY resync.sh /resync.sh
RUN chmod +x /resync.sh
USER postgres
ENTRYPOINT ["/resync.sh"]
