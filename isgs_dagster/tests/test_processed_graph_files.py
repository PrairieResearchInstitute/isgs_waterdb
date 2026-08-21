import io

import pandas as pd
import pytest

from isgs_dagster.defs import processed_graph_files
from isgs_dagster.defs.processed_graph_files import _process_one_file


class _NullLog:
    def info(self, msg):
        pass

    def error(self, msg):
        pass


class _FakeContext:
    log = _NullLog()


class _FakeS3:
    def __init__(self, body: bytes):
        self._body = body

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self._body)}


# WLE_GW and DTW_GW share the same DT/ISGS_Num/station-name shape. Station A
# has a numeric depth-to-water reading above the threshold, station B has a
# non-numeric cell ("NR" = not recorded), station C only appears in WLE_GW,
# and station D has a numeric reading below the threshold.
WLE_GW = pd.DataFrame(
    {
        "DT": ["2024-01-01", "2024-01-02"],
        "ISGS_Num": [1, 1],
        "Station A": [100.0, 101.0],
        "Station B": [200.0, 201.0],
        "Station C": [300.0, 301.0],
        "Station D": [400.0, 401.0],
    }
)

DTW_GW = pd.DataFrame(
    {
        "DT": ["2024-01-01", "2024-01-02"],
        "ISGS_Num": [1, 1],
        "Station A": [5.5, 6.5],
        "Station B": ["NR", 7.5],
        "Station D": [0.1, 0.2],
    }
)


def _make_workbook_bytes() -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        WLE_GW.to_excel(writer, sheet_name="WLE_GW", index=False)
        DTW_GW.to_excel(writer, sheet_name="DTW_GW", index=False)
    return buf.getvalue()


@pytest.fixture
def result_df(tmp_path, monkeypatch):
    monkeypatch.setattr(processed_graph_files, "SCRATCH_DIR", tmp_path)
    s3 = _FakeS3(_make_workbook_bytes())
    _process_one_file(s3, "some/key.xlsx", "20240101_20240102", _FakeContext())
    csv_path = tmp_path / "20240101_20240102_key_wle_gw.csv"
    return pd.read_csv(csv_path)


def test_numeric_dtw_cell_is_joined(result_df):
    row = result_df[(result_df["station_name"] == "Station A") & (result_df["DT"] == "2024-01-01")]
    assert row["depth_to_water"].iloc[0] == 5.5


def test_non_numeric_dtw_cell_is_none(result_df):
    row = result_df[(result_df["station_name"] == "Station B") & (result_df["DT"] == "2024-01-01")]
    assert pd.isna(row["depth_to_water"].iloc[0])


def test_station_missing_from_dtw_gw_is_none(result_df):
    rows = result_df[result_df["station_name"] == "Station C"]
    assert len(rows) == 2
    assert rows["depth_to_water"].isna().all()


def test_wle_gw_columns_are_preserved(result_df):
    row = result_df[(result_df["station_name"] == "Station A") & (result_df["DT"] == "2024-01-01")]
    assert row["water_level_elevation"].iloc[0] == 100.0


def test_depth_at_or_above_threshold_is_true(result_df):
    rows = result_df[result_df["station_name"] == "Station A"]
    assert rows["water_table_threshold"].tolist() == [True, True]


def test_depth_below_threshold_is_false(result_df):
    rows = result_df[result_df["station_name"] == "Station D"]
    assert rows["water_table_threshold"].tolist() == [False, False]


def test_missing_depth_gives_null_threshold(result_df):
    row = result_df[(result_df["station_name"] == "Station B") & (result_df["DT"] == "2024-01-01")]
    assert pd.isna(row["water_table_threshold"].iloc[0])

    rows = result_df[result_df["station_name"] == "Station C"]
    assert rows["water_table_threshold"].isna().all()
