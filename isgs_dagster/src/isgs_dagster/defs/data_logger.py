import csv
import io
from datetime import datetime
from urllib.parse import urlparse

import dagster as dg

from isgs_dagster.resources import PostgresResource, ObjectStoreResource


class DataLoggerConfig(dg.Config):
    station_visit_id: int
    uri: str  # s3://bucket/path/to/file.csv


def _parse_float(value: str) -> float | None:
    value = value.strip()
    return float(value) if value else None


def parse_aquatroll_rows(content: str, station_visit_id: int) -> list[tuple]:
    """Parse an In-Situ Aqua TROLL 200 WinSitu CSV export.

    The file has a long metadata preamble followed by a data section whose
    header row is ``Date and Time, Seconds, Temperature (C), Pressure (PSI),
    Depth (m), Specific Conductivity (uS/cm), Barometric Pressure (PSI)``.
    Pressure and Depth are the baro-corrected channels. Rows are space padded.
    """
    rows: list[tuple] = []
    reader = csv.reader(io.StringIO(content))
    header_found = False
    for row in reader:
        if not header_found:
            # The "Log Notes" section also has a `Date and Time,Note` header;
            # the real data header is distinguished by the "Seconds" column.
            if (
                len(row) >= 2
                and row[0].strip() == "Date and Time"
                and row[1].strip().startswith("Seconds")
            ):
                header_found = True
            continue
        if len(row) < 7 or not row[0].strip():
            continue
        try:
            ts = datetime.strptime(row[0].strip(), "%m/%d/%Y %I:%M:%S %p")
        except ValueError:
            continue
        rows.append((
            station_visit_id,
            ts,
            _parse_float(row[3]),  # pressure (corrected)
            _parse_float(row[2]),  # temperature
            _parse_float(row[4]),  # depth (corrected)
            _parse_float(row[5]),  # specific conductivity
            _parse_float(row[6]),  # barometric pressure
        ))
    return rows


@dg.asset
def data_logger(
    context: dg.AssetExecutionContext,
    config: DataLoggerConfig,
    postgres: PostgresResource,
    rustfs: ObjectStoreResource,
) -> dg.MaterializeResult:
    parsed = urlparse(config.uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")

    s3 = rustfs.get_s3_client()
    response = s3.get_object(Bucket=bucket, Key=key)
    content = response["Body"].read().decode("latin-1")

    rows = parse_aquatroll_rows(content, config.station_visit_id)

    conn = postgres.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM pressure_temperature_depth WHERE station_visit_id = %s",
                (config.station_visit_id,),
            )
            cur.executemany(
                "INSERT INTO pressure_temperature_depth "
                "(station_visit_id, timestamp, pressure, temperature, depth, "
                "specific_conductivity, barometric_pressure) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                rows,
            )
        conn.commit()
    finally:
        conn.close()

    context.log.info(
        f"Inserted {len(rows)} rows for station_visit_id={config.station_visit_id}"
    )
    return dg.MaterializeResult(
        metadata={"rows_inserted": len(rows), "uri": config.uri}
    )