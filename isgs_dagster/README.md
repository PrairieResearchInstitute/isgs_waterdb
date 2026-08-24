# isgs_dagster

## Getting started

### Installing dependencies

**Option 1: uv**

Ensure [`uv`](https://docs.astral.sh/uv/) is installed following their [official documentation](https://docs.astral.sh/uv/getting-started/installation/).

Create a virtual environment, and install the required dependencies using _sync_:

```bash
uv sync
```

Then, activate the virtual environment:

| OS | Command |
| --- | --- |
| MacOS | ```source .venv/bin/activate``` |
| Windows | ```.venv\Scripts\activate``` |

**Option 2: pip**

Install the python dependencies with [pip](https://pypi.org/project/pip/):

```bash
python3 -m venv .venv
```

Then activate the virtual environment:

| OS | Command |
| --- | --- |
| MacOS | ```source .venv/bin/activate``` |
| Windows | ```.venv\Scripts\activate``` |

Install the required dependencies:

```bash
pip install -e .
pip install --group dev .   # requires pip >= 25.1
```

> Dev dependencies live in `[dependency-groups]` (PEP 735), not in an extra, so
> `pip install -e ".[dev]"` will **not** install them. `uv sync` (option 1) is
> the supported path.

### Running Dagster

Start the Dagster UI web server:

```bash
dg dev
```

Open http://localhost:3000 in your browser to see the project.

## Configuration

Copy `.env.example` to `.env` and fill it in. All seven variables are required at
runtime -- the resources in `src/isgs_dagster/resources.py` resolve them through
`dg.EnvVar`, so a missing one fails the run rather than the import.

| variable | purpose |
| --- | --- |
| `DATABASE_URL` | Postgres holding the application schema (owned by the `web/` app) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | RustFS/MinIO, bucket `watershed` -- uploads from the web app |
| `TAIGA_ENDPOINT`, `TAIGA_ACCESS_KEY`, `TAIGA_SECRET_KEY` | external NCSA S3, bucket `graphing-data` |
| `ISGS_SCRATCH_DIR` | optional; where `processed_graph_files` writes CSVs (defaults to `<repo>/scratch`) |

## Docker

`Dockerfile` builds a single image published by
`.github/workflows/release-docker.yml` on every GitHub release:

```
ghcr.io/prairieresearchinstitute/isgs_waterdb-dagster:<release-tag>
```

One image serves every Dagster process, because Dagster requires the `dagster`
core version to match exactly across all of them. The deployment picks the role
with `command`:

| role | command |
| --- | --- |
| code location | `dagster api grpc -h 0.0.0.0 -p 4000 -m isgs_dagster.definitions` (default `CMD`) |
| webserver | `dagster-webserver -h 0.0.0.0 -p 3000 -w $DAGSTER_HOME/workspace.yaml` |
| daemon | `dagster-daemon run` |
| per-run container | created by `DockerRunLauncher` from this same image |

Build and smoke-test locally:

```bash
docker build -t isgs-dagster:dev ./isgs_dagster        # from the repo root
docker run --rm isgs-dagster:dev dagster api grpc-health-check -p 4000 -h 127.0.0.1
```

### Deploying

`docker-compose.yaml` for the VM lives in a **separate** repo. This image ships
no `dagster.yaml` or `workspace.yaml`; the deployment bind-mounts them at
`$DAGSTER_HOME`. Working references are committed under `deploy/`:

- `deploy/dagster.yaml.example`
- `deploy/workspace.yaml.example`
- `deploy/docker-compose.dagster.example.yml`
- `deploy/DEPLOYMENT_PROMPT.md` -- a self-contained brief describing this
  image's contract, to hand to whoever configures the production stack

Five things there are easy to get wrong:

1. **Run containers start with an empty environment.** `DockerRunLauncher` passes
   only `run_launcher.config.env_vars` plus `DAGSTER_RUN_JOB_NAME`. Every variable
   the resources touch must be listed. Because the bare `KEY` form copies from the
   launching process, the **daemon** also needs all of them set even though it
   never uses them.
2. **The daemon is not optional.** All three sensors tick every 30s and only the
   daemon runs them. Cursors and dynamic partitions live in instance storage, so
   storage must be Postgres -- SQLite cannot be shared across the webserver,
   daemon, and run containers. This repo's seeder image already creates the
   `dagster` database.
3. **`DAGSTER_CURRENT_IMAGE`** must be set on the code location service to the
   fully qualified `-dagster` tag; that is how the run launcher picks the run
   image.
4. **Compute logs need a shared volume, with pinned names.** The default compute
   log manager writes op stdout/stderr under `$DAGSTER_HOME/storage`, and that
   path travels into the run container's throwaway filesystem. Without a shared
   volume the UI shows no logs for any run. The volume names in
   `container_kwargs.volumes` are raw Docker names -- the launcher bypasses
   Compose -- so pin `name:` on those volumes or the run containers will mount
   different volumes than the webserver.
5. **`op_tags={"warehouse": "in_use"}`** on `processed_graph_files` is inert
   without matching `run_queue.tag_concurrency_limits`, and `discover_s3_folders`
   can request 25 runs in one tick. Keep those limits.

Both the daemon and the webserver need `/var/run/docker.sock` -- the webserver
reaches the run launcher for run termination.


## Learn more

To learn more about this template and Dagster in general:

- [Dagster Documentation](https://docs.dagster.io/)
- [Dagster University](https://courses.dagster.io/)
- [Dagster Slack Community](https://dagster.io/slack)
