# Prompt for the deployment repo

Paste everything below the line into a Claude Code session in the repo that owns
the production `docker-compose.yaml`. It is self-contained: that repo has no
access to this source tree, so every fact it needs is stated here.

Keep this file in sync with `Dockerfile` and `deploy/*.example` if the image
contract changes.

---

I need you to **add Dagster** to the existing docker-compose stack in this repo
and wire it into the Postgres and object store that are already there. The
Postgres, object store, and SvelteKit web services are already configured
correctly — **do not restructure or "improve" them.** Read them to learn the
service names, network, and credential conventions, then leave them alone.

This is purely additive: three new long-lived services, two new volumes, and two
new config files. Below is the complete contract for the Dagster image. Treat it
as authoritative — I have verified all of it against running containers. Ask me
before inventing anything not covered here.

## What Dagster needs from the existing stack

| dependency | what Dagster needs |
| --- | --- |
| Postgres | Two databases on the **existing** instance: the application DB (Dagster reads and writes the app's tables) and a separate `dagster` DB for Dagster's own instance storage. See the prerequisite note below. |
| Object store | Reachable by service name over the compose network, with credentials. Dagster reads files the web app uploaded to the `watershed` bucket. |
| Network | The Dagster services must sit on the same compose network as Postgres and the object store, and resolve them by service name. |
| Egress | Outbound HTTPS to an external S3 endpoint on a non-standard port (see env vars). |

**Prerequisite to confirm before you start:** Dagster's instance storage needs its
own database named `dagster` on the existing Postgres. In our stack the one-shot
seeder service already runs `CREATE DATABASE dagster`. Check whether this repo's
stack does that. If not, tell me — we need either an init step or a manual
`CREATE DATABASE dagster` before Dagster will start.

Also: the Dagster image reads application tables whose schema is owned by the web
app, so **keep the Dagster image on the same release tag** as the web and seeder
images. Images are published on GitHub release and tagged with the release tag;
there is no `latest`, so pin an explicit tag.

## The Dagster image: one image, four roles

`ghcr.io/prairieresearchinstitute/isgs_waterdb-dagster:<tag>` (multi-arch,
linux/amd64 + linux/arm64) contains Dagster 1.13.6, `dagster-webserver`,
`dagster-postgres`, `dagster-docker`, and the project code. One image serves every
role, because Dagster requires the `dagster` core version to match exactly across
all of them. Roles are selected with `command`:

| role | command | notes |
| --- | --- | --- |
| code location | *(image default `CMD`)* `dagster api grpc -h 0.0.0.0 -p 4000 -m isgs_dagster.definitions` | long-lived, serves definitions over gRPC on 4000 |
| webserver | `dagster-webserver -h 0.0.0.0 -p 3000 -w $DAGSTER_HOME/workspace.yaml` | the UI |
| daemon | `dagster-daemon run` | **required**, see gotcha 4 |
| run container | injected by `DockerRunLauncher` | one per run, created at runtime from this same image |

So: three services in compose, plus transient run containers created by the
daemon at runtime.

Image facts you can rely on:

- `WORKDIR /app`; the virtualenv is at `/app/.venv` and already on `PATH`.
- Runs as **root**, deliberately: the daemon and webserver both need
  `/var/run/docker.sock`.
- `ISGS_SCRATCH_DIR=/scratch` is baked in; `/scratch` and
  `/opt/dagster/dagster_home` both exist.
- `DAGSTER_HOME` is deliberately **not** set in the image. Set it per-service
  (`/opt/dagster/dagster_home`) on the webserver and daemon only. Do not set it
  globally — image `ENV` would leak into run containers, which do not need it and
  would then be able to create a stray SQLite instance.
- No `curl` (it is a `python:slim` base). For the code location's healthcheck use
  `dagster api grpc-health-check -p 4000 -h 127.0.0.1`.

## Config files the image does NOT ship

The image contains no `dagster.yaml` or `workspace.yaml` — **this repo owns
them**. Bind-mount them read-only at `$DAGSTER_HOME/` on the webserver and
daemon. Run containers must NOT get them: the run launcher serializes the whole
instance config into the container's argv instead.

`workspace.yaml` needs one `grpc_server` entry pointing at the code location
service by its compose service name, port 4000, `location_name: isgs_dagster`.

`dagster.yaml` needs, at minimum:

1. **Postgres instance storage** against the existing Postgres service, database
   `dagster`. Not optional and not SQLite: the webserver, daemon, and every run
   container are separate processes that must share run/event/schedule tables.
2. **`run_launcher`**: `dagster_docker.DockerRunLauncher`.
3. **`run_queue`** with `tag_concurrency_limits` — see gotcha 4.

## Required environment variables

Seven are consumed by the application's Dagster resources, which resolve them via
`dg.EnvVar` at resource-init time. Reuse the existing stack's credentials and
service names for the first six — match whatever the web service already uses.

| variable | value |
| --- | --- |
| `DATABASE_URL` | `postgresql://<user>:<pw>@<postgres-service>:5432/<app-db>` — the **application** database, not the `dagster` one |
| `S3_ENDPOINT` | the existing object store, e.g. `http://<objectstore-service>:9000` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | existing object store credentials |
| `TAIGA_ENDPOINT` | `https://taiga-dtn-s3.ncsa.illinois.edu:51014` (external; needs egress on 51014) |
| `TAIGA_ACCESS_KEY` / `TAIGA_SECRET_KEY` | Taiga credentials — ask me, these are not in the existing stack |

Plus `DAGSTER_PG_PASSWORD` if `dagster.yaml` reads the storage password from the
environment, and `DAGSTER_HOME` on the webserver and daemon.

Note the two different databases: `DATABASE_URL` points at the **application**
database, while `dagster.yaml`'s storage block points at the **`dagster`**
database. Both live on the same Postgres instance.

## Five things that are easy to get wrong

1. **Run containers start with an empty environment.** `DockerRunLauncher` passes
   only `run_launcher.config.env_vars` plus `DAGSTER_RUN_JOB_NAME` — nothing is
   inherited. Every variable above must be listed in `env_vars`. And because the
   bare `KEY` form copies the value from the *launching* process (and raises if
   unset), the **daemon service also needs all of them set**, even though it
   never uses them itself.
2. **`DAGSTER_CURRENT_IMAGE`** must be set on the code location service to the
   fully qualified image tag, including the `-dagster` suffix. That is how the run
   launcher knows which image to start for a run. Get this wrong and runs either
   fail or silently execute the wrong code.
3. **Compute logs need a shared volume.** Dagster's default compute log manager
   writes op stdout/stderr under `$DAGSTER_HOME/storage`, and that path is carried
   into each run container's throwaway filesystem. Without one named volume
   mounted at `$DAGSTER_HOME/storage` on the webserver, the daemon, **and** in
   `run_launcher.config.container_kwargs.volumes`, the UI shows no logs at all for
   any run. Same applies to `/scratch`, where one asset writes CSV output.

   **The volume names in `container_kwargs.volumes` are raw Docker names.** The
   launcher talks to the Docker API directly and knows nothing about Compose's
   `<project>_` prefixing, so a volume declared plainly as `dagster_storage:` in
   compose becomes `<project>_dagster_storage` for the long-lived services while
   the run container mounts a *different*, auto-created volume literally named
   `dagster_storage`. Everything looks healthy and the logs silently go nowhere.
   Pin explicit `name:` values on these volumes so both sides resolve to the same
   volume. I hit this exact failure while testing; do not skip it.
4. **The daemon is required, and concurrency must be capped.** All three sensors
   tick every 30 seconds and only the daemon runs them — without it nothing is
   ever ingested. One sensor (`discover_s3_folders`) can request up to 25 runs in
   a single tick, and the asset it targets loads entire `.xlsx` workbooks into
   memory. The asset carries `op_tags={"warehouse": "in_use"}`, which is inert
   unless `dagster.yaml` has a matching `run_queue.tag_concurrency_limits` entry.
   Set that limit low (2–3) and set `max_concurrent_runs`.
5. **`container_kwargs` rejects `image`, `environment`, and `network`.** Use the
   launcher's own `image` / `env_vars` / `networks` config keys instead. Note also
   that only the *first* entry in `networks` is attached at container creation, so
   name the existing compose network **explicitly** in `networks` — run containers
   are created outside Compose and will not join it otherwise, and then they
   cannot reach Postgres or the object store at all.

Both the daemon **and** the webserver need `/var/run/docker.sock` mounted — the
webserver reaches the run launcher for run termination and `canTerminate`.

## Production concerns I want you to address

- **The Dagster UI has no authentication.** Dagster OSS ships none. Do not publish
  its port to the internet. Put it behind a reverse proxy with auth, or bind it to
  localhost/VPN only. Follow whatever pattern the existing web service uses for
  ingress. Tell me which you did.
- **The web service already uses port 3000.** Publish the Dagster webserver on a
  different host port (3001 unless that conflicts with something in this stack).
- **Mounting `/var/run/docker.sock` grants root-equivalent access to the host** to
  the webserver and daemon containers. Note it in a comment so nobody accidentally
  widens exposure later.
- **Secrets** should follow whatever convention the existing services use
  (`env_file`, Docker secrets, etc.) rather than being inlined. Add the new
  variables to the existing `.env.example` (or equivalent) and make the compose
  entries fail loudly (`${VAR:?}`) on anything missing.
- **The `dagster` database is new persistent state** on the existing Postgres:
  run history, sensor cursors, and dynamic partition registrations. If it is lost,
  the cursor-driven sensors reprocess their whole queue from scratch. Make sure it
  is covered by whatever backup exists for that Postgres instance — it may only
  back up the application database today.
- **The `-dagster` GHCR package is new and defaults to private.** The VM's Docker
  daemon pulls this image directly to create run containers, so either the package
  must be made public or the daemon needs registry credentials. Flag which is
  needed.
- **Memory limits** on run containers via `container_kwargs`, given the in-memory
  workbook parsing. Also consider whether `auto_remove: true` is right — it keeps
  the host clean but discards failed containers you might want to inspect.
- **Startup ordering**: the Dagster services depend on Postgres being healthy and
  on the `dagster` database existing. The webserver and daemon should additionally
  wait on the code location's healthcheck (`condition: service_healthy`).
- **`restart: unless-stopped`** on all three Dagster services, and log rotation so
  the daemon's 30-second sensor ticks do not fill the disk.

## One thing to verify before first deploy

`TAIGA_ENDPOINT` is an internal NCSA host on port 51014. boto3 uses botocore's
bundled CA list, so if that host presents a certificate from a non-public CA,
every object fetch fails. Check with
`openssl s_client -connect taiga-dtn-s3.ncsa.illinois.edu:51014`. If it needs a
private CA, mount the CA bundle and set `AWS_CA_BUNDLE` — including in
`run_launcher.config.env_vars` and `container_kwargs.volumes`, or runs will fail
while the long-lived services look healthy.

## Deliverables

1. The three new Dagster services added to the existing `docker-compose.yaml`,
   with the existing services left untouched.
2. `dagster.yaml` and `workspace.yaml`.
3. The new environment variables added to the existing example env file.
4. A short README section: how to deploy, how to bump the image tag, and how to
   confirm Dagster is healthy — the UI lists 3 assets and 3 sensors; a sensor tick
   creates a *separate* run container visible in `docker ps`; and that run's logs
   are readable in the UI afterwards. That last check is what proves the
   compute-log volume wiring is correct.

Show me the diff to the compose file and explain any decision where you deviated
from the above or had to choose between options.
