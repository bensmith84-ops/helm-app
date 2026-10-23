# PostgREST (the engine Supabase uses for /rest/v1) for Helm on Cloud Run.
# Official static release binary, pinned by checksum. The DB connection and JWT
# secret come from the same env/secrets helm-api uses; nothing is baked in.
FROM debian:bookworm-slim
ARG PGRST_VERSION=v12.2.8
ARG PGRST_SHA256=7da60261909ab7e6fc2f0c0c1d484985f17710151e1c94e8229559eaa23cd611
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && curl -fsSL -o /tmp/pgrst.tar.xz "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-linux-static-x86-64.tar.xz" \
 && echo "${PGRST_SHA256}  /tmp/pgrst.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/pgrst.tar.xz -C /usr/local/bin postgrest \
 && rm /tmp/pgrst.tar.xz && apt-get purge -y curl xz-utils && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER nobody
ENTRYPOINT ["/entrypoint.sh"]
