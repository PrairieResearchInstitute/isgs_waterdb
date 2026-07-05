import dagster as dg

from isgs_dagster.resources import PostgresResource

imported_file = dg.define_asset_job(
    name="imported_file",
    selection=["data_logger"],
)


@dg.sensor(job=imported_file, minimum_interval_seconds=30)
def station_visit_import_queue_sensor(context: dg.SensorEvaluationContext, postgres: PostgresResource):
    last_timestamp = context.cursor or "1970-01-01T00:00:00"

    with postgres.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT q.id, q.station_visit_id, q.uri, q.timestamp,
                       lst.short_type, lsrt.logger_type
                FROM station_visit_import_queue q
                JOIN station_visits sv ON sv.id = q.station_visit_id
                JOIN stations s ON s.id = sv.station_id
                JOIN lut_station_type lst ON lst.id = s.type_id
                LEFT JOIN lut_station_read_type lsrt ON lsrt.id = s.station_type_id
                WHERE q.timestamp > %s
                ORDER BY q.timestamp ASC
                """,
                (last_timestamp,),
            )
            rows = cur.fetchall()

    if not rows:
        return

    run_requests = []
    latest_ts = last_timestamp
    for row_id, station_visit_id, uri, ts, short_type, logger_type in rows:
        run_requests.append(
            dg.RunRequest(
                run_key=str(row_id),
                run_config={
                    "ops": {
                        "data_logger": {
                            "config": {
                                "station_visit_id": station_visit_id,
                                "uri": uri,
                                "station_type": short_type or "GW",
                                "read_type": logger_type or "Aquatroll",
                            }
                        }
                    }
                },
                tags={
                    "station_visit_import_queue_id": str(row_id),
                    "station_visit_id": str(station_visit_id),
                    "uri": uri,
                },
            )
        )
        latest_ts = ts.isoformat()

    return dg.SensorResult(run_requests=run_requests, cursor=latest_ts)