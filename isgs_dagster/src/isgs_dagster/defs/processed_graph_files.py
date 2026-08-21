import io
from pathlib import Path

import dagster as dg
import pandas as pd

from isgs_dagster.resources import TaigaResource

BUCKET = "graphing-data"
ROOT_PREFIX = ""   # everything lives under here
WATER_TABLE_THRESHOLD_M = 0.3048  # 1 ft, in meters
REPO_ROOT = Path(__file__).resolve().parents[4]
SCRATCH_DIR = REPO_ROOT / "scratch"

folder_partitions = dg.DynamicPartitionsDefinition(name="s3_date_range_folders")

@dg.asset(
    partitions_def=folder_partitions,
    retry_policy=dg.RetryPolicy(max_retries=2, delay=30),
    op_tags={"warehouse": "in_use"},   # for tag-based concurrency, see below
)
def processed_graph_files(context: dg.AssetExecutionContext,
                          taiga: TaigaResource) -> dg.MaterializeResult:
    folder = context.partition_key           # e.g. "20230901_20241002"
    prefix = f"{ROOT_PREFIX}{folder}/"
    s3 = taiga.get_s3_client()

    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
        keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith(".xlsx")]

    context.log.info(f"{folder}: {len(keys)} xlsx files")

    failed = []
    for key in keys:
        try:
            _process_one_file(s3, key, folder, context)   # MUST be idempotent — see below
        except Exception as e:
            context.log.error(f"failed {key}: {e}")
            failed.append(key)

    if failed:
        raise Exception(f"{len(failed)}/{len(keys)} files failed in {folder}: {failed[:5]}")

    return dg.MaterializeResult(metadata={"folder": folder, "num_files": len(keys)})

def _process_one_file(s3, key, folder, context: dg.AssetExecutionContext):
    context.log.info(f"processing {key}")

    body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()

    excel_file = pd.ExcelFile(io.BytesIO(body), engine="openpyxl")
    context.log.info(f"{key}: tabs = {excel_file.sheet_names}")

    wle_gw = pd.read_excel(excel_file, sheet_name="WLE_GW")
    station_columns = wle_gw.columns[2:]
    long_df = wle_gw.melt(
        id_vars=["DT", "ISGS_Num"],
        value_vars=station_columns,
        var_name="station_name",
        value_name="reading",
    )

    numeric_reading = pd.to_numeric(long_df["reading"], errors="coerce")
    long_df["water_level_elevation"] = numeric_reading
    long_df["status"] = long_df["reading"].where(numeric_reading.isna() & long_df["reading"].notna())
    long_df = long_df.drop(columns="reading")

    context.log.info(f"{key}: WLE_GW reshaped to {len(long_df)} rows")

    dtw_gw = pd.read_excel(excel_file, sheet_name="DTW_GW")
    dtw_station_columns = dtw_gw.columns[2:]
    dtw_long = dtw_gw.melt(
        id_vars=["DT", "ISGS_Num"],
        value_vars=dtw_station_columns,
        var_name="station_name",
        value_name="reading",
    )
    dtw_long["depth_to_water"] = pd.to_numeric(dtw_long["reading"], errors="coerce")
    dtw_long = dtw_long.drop(columns="reading")

    long_df = long_df.merge(dtw_long, on=["DT", "ISGS_Num", "station_name"], how="left")

    long_df["water_table_threshold"] = long_df["depth_to_water"].apply(
        lambda v: v >= WATER_TABLE_THRESHOLD_M if pd.notna(v) else None
    )

    context.log.info(f"{key}: joined DTW_GW, {len(long_df)} rows")

    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = SCRATCH_DIR / f"{folder}_{Path(key).stem}_wle_gw.csv"
    long_df.to_csv(csv_path, index=False)
    context.log.info(f"{key}: wrote {csv_path}")


@dg.sensor(target=processed_graph_files, minimum_interval_seconds=30)
def discover_s3_folders(context: dg.SensorEvaluationContext,
                        taiga: TaigaResource):
    s3 = taiga.get_s3_client()
    existing = set(folder_partitions.get_partition_keys(
        dynamic_partitions_store=context.instance))

    found = set()
    for page in s3.get_paginator("list_objects_v2").paginate(
            Bucket=BUCKET, Prefix=ROOT_PREFIX, Delimiter="/"):
        for cp in page.get("CommonPrefixes", []):
            found.add(cp["Prefix"][len(ROOT_PREFIX):].rstrip("/"))

    context.log.info(f"found {len(found)} folders")
    new = sorted(found - existing)
    if not new:
        return dg.SkipReason("no new folders")

    add_req = folder_partitions.build_add_request(new)

    # Guard: don't auto-run a huge initial backlog — register only, backfill manually.
    if len(new) > 25:
        return dg.SensorResult(
            dynamic_partitions_requests=[add_req],
            skip_reason=f"Registered {len(new)} folders; run a backfill for the historic load.",
        )

    return dg.SensorResult(
        dynamic_partitions_requests=[add_req],
        run_requests=[dg.RunRequest(partition_key=f) for f in new],
    )