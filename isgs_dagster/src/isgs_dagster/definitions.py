import dagster as dg

from isgs_dagster.defs.data_logger import data_logger
from isgs_dagster.defs.sonde_data import sonde_data
from isgs_dagster.defs.station_visit_import_queue_sensor import station_visit_import_queue_sensor, imported_file
from isgs_dagster.defs.sonde_import_queue_sensor import sonde_import_queue_sensor, sonde_imported_file
from isgs_dagster.defs.processed_graph_files import processed_graph_files, discover_s3_folders
from isgs_dagster.resources import PostgresResource, ObjectStoreResource, TaigaResource

defs = dg.Definitions(
    assets=[data_logger, sonde_data, processed_graph_files],
    jobs=[imported_file, sonde_imported_file],
    sensors=[station_visit_import_queue_sensor, sonde_import_queue_sensor, discover_s3_folders],
    resources={
        "postgres": PostgresResource(),
        "rustfs": ObjectStoreResource(),
        "taiga": TaigaResource(),
    },
)