# Single image for every Dagster process: the webserver, the daemon, the code
# location gRPC server, and the per-run containers that DockerRunLauncher
# creates. Dagster requires the `dagster` core version to match exactly across
# all four, so one image makes that structural rather than a hand-maintained
# invariant. The compose project selects the role via `command:`.
#
# Python 3.13 matches the development venv, which matters because uv.lock forks
# pandas and resolves 3.0.3 for >= 3.11. `-bookworm` is explicit because
# `3.13-slim` now defaults to trixie.
FROM python:3.13-slim-bookworm AS builder

# uv.lock is revision 3, so uv must be at least 0.11.23 or `--locked` fails.
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv

# uv defaults to *managed* Python: left alone it downloads its own standalone
# CPython and points the venv symlink at it, which would dangle after the COPY
# into the runtime stage. Pin it to the image's own interpreter.
ENV UV_NO_MANAGED_PYTHON=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=/usr/local/bin/python3.13 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# Dependencies first, so a source-only change doesn't re-resolve them.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-default-groups --group deploy --no-install-project

COPY src ./src
COPY README.md ./
RUN uv sync --locked --no-default-groups --group deploy


FROM python:3.13-slim-bookworm AS dagster

# Named `dagster` rather than `runtime` on purpose: the release workflow keys
# artifact names, GHA cache scopes, and the manifest-merge digest pattern off the
# stage name, so it has to be unique across the repo's Dockerfiles.

# Load-bearing: `dagster api grpc` bakes working_directory=os.getcwd() into the
# LoadableTargetOrigin that is serialized into every run's origin and chdir'd to
# inside the run container.
WORKDIR /app

COPY --from=builder /app /app

# DAGSTER_HOME is deliberately NOT set here. Image ENV applies to every container
# started from the image, including run containers, which receive a serialized
# InstanceRef instead and need no DAGSTER_HOME. Setting it would let a stray
# DagsterInstance.get() silently create a throwaway SQLite instance. The compose
# project sets it per-service; the directory exists so a mount lands cleanly.
RUN mkdir -p /scratch /opt/dagster/dagster_home

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    ISGS_SCRATCH_DIR=/scratch

# Runs as root: the daemon and the webserver both need /var/run/docker.sock, and
# a non-root user would need the host's docker GID baked in at build time.

EXPOSE 4000

# Default role is the code location server. The webserver and daemon services
# override this, and DockerRunLauncher replaces it entirely in run containers.
CMD ["dagster", "api", "grpc", "-h", "0.0.0.0", "-p", "4000", \
     "-m", "isgs_dagster.definitions"]
