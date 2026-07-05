from datetime import datetime

from isgs_dagster.defs.data_logger import parse_aquatroll_rows, parse_insitu_rows

# Mirrors the structure of a real Aqua TROLL 200 WinSitu export: a metadata
# preamble (including the "Log Notes" section whose `Date and Time,Note` header
# must NOT be mistaken for the data header), the qualifier rows, the real data
# header, and space-padded data rows (one with a blank measurement cell).
AQT_SNIPPET = """\
Report Date:,1/14/2026 3:54:40 PM
Report User Name:,mcc12

Device Properties
Device,Aqua TROLL 200
Serial Number,1175824

Log Notes:
Date and Time,Note
10/7/2025 8:23:49 AM  ,Used Battery: 7% Used Memory: 7%   User Name: toughpad.admin


Log Data:
Record Count,3

Time Zone: Central Standard Time

,,Sensor: PCTD(A) 35.8ft ,Sensor: PCTD(A) 35.8ft ,Sensor: PCTD(A) 35.8ft ,Sensor: PCTD(A) 35.8ft ,Sensor: Baro-Adj Calc ,
,,SN#: 1175824 ,SN#: 1175824 ,SN#: 1175824 ,SN#: 1175824 ,SN#: 000000 ,
,Elapsed Time,,Corrected,Corrected,,,
Date and Time,Seconds     ,Temperature (C),Pressure (PSI),Depth (m),Specific Conductivity (uS/cm),Barometric Pressure (PSI),
10/7/2025 9:00:00 AM  ,       0.000,                                  16.080,                                   0.019,                                   0.014,                                   0.000,                                  14.471,
10/7/2025 12:00:00 PM ,   10800.000,                                  15.978,                                   0.019,                                   0.013,                                   0.000,                                  14.469,
10/7/2025 3:00:00 PM  ,   21600.000,                                  15.978,                                   0.017,                                   0.012,                                        ,                                  14.473,
"""


def test_parses_data_rows():
    rows = parse_aquatroll_rows(AQT_SNIPPET, station_visit_id=7)
    assert len(rows) == 3
    # (station_visit_id, timestamp, pressure, temperature, depth,
    #  specific_conductivity, barometric_pressure)
    assert rows[0] == (7, datetime(2025, 10, 7, 9, 0, 0), 0.019, 16.080, 0.014, 0.000, 14.471)
    assert rows[1] == (7, datetime(2025, 10, 7, 12, 0, 0), 0.019, 15.978, 0.013, 0.000, 14.469)


def test_ignores_log_notes_header():
    # The `Date and Time,Note` line in Log Notes must not start parsing, and the
    # note's timestamp must never appear as a data row.
    rows = parse_aquatroll_rows(AQT_SNIPPET, station_visit_id=1)
    timestamps = [r[1] for r in rows]
    assert datetime(2025, 10, 7, 8, 23, 49) not in timestamps
    assert len(rows) == 3


def test_blank_measurement_is_none():
    rows = parse_aquatroll_rows(AQT_SNIPPET, station_visit_id=1)
    # Third data row has a blank specific conductivity cell (index 5 in the tuple).
    assert rows[2][5] is None
    assert rows[2][1] == datetime(2025, 10, 7, 15, 0, 0)


def test_station_visit_id_propagated():
    rows = parse_aquatroll_rows(AQT_SNIPPET, station_visit_id=42)
    assert all(r[0] == 42 for r in rows)


def test_handles_crlf():
    crlf = AQT_SNIPPET.replace("\n", "\r\n")
    assert parse_aquatroll_rows(crlf, station_visit_id=7) == parse_aquatroll_rows(
        AQT_SNIPPET, station_visit_id=7
    )


# Mirrors the structure of a real BaroTROLL 500 WinSitu export: the same
# metadata preamble and "Log Notes" section as the Aqua TROLL, but with only
# temperature and barometric pressure channels in the data section (one row has
# a blank temperature cell).
INS_SNIPPET = """\
Report Date:,6/11/2026 9:12:53 AM
Report User Name:,nasheff

Device Properties
Device,BaroTROLL 500
Serial Number,1146367

Log Notes:
Date and Time,Note
4/21/2026 10:34:00 AM ,Used Battery: 8% Used Memory: 6%   User Name: toughpad.admin


Log Data:
Record Count,3

Time Zone: Central Standard Time

,,Sensor: Baro Pres ,Sensor: Baro Pres ,
,Elapsed Time,SN#: 1146367 ,SN#: 1146367 ,
Date and Time,Seconds     ,Temperature (C)                         ,Barometric Pressure (PSI)               ,
4/21/2026 11:00:00 AM ,       0.000,                                  29.800,                                  14.366,
4/21/2026 12:00:00 PM ,    3600.001,                                  22.557,                                  14.368,
4/21/2026 1:00:00 PM  ,    7200.001,                                        ,                                  14.365,
"""


def test_insitu_parses_data_rows():
    rows = parse_insitu_rows(INS_SNIPPET, station_visit_id=7)
    assert len(rows) == 3
    # (station_visit_id, timestamp, pressure, temperature, depth,
    #  specific_conductivity, barometric_pressure)
    assert rows[0] == (7, datetime(2026, 4, 21, 11, 0, 0), None, 29.800, None, None, 14.366)
    assert rows[1] == (7, datetime(2026, 4, 21, 12, 0, 0), None, 22.557, None, None, 14.368)


def test_insitu_absent_channels_are_none():
    rows = parse_insitu_rows(INS_SNIPPET, station_visit_id=1)
    # pressure (2), depth (4) and specific conductivity (5) are never recorded.
    assert all(r[2] is None and r[4] is None and r[5] is None for r in rows)
    # A blank temperature cell also parses to None.
    assert rows[2][3] is None
    assert rows[2][1] == datetime(2026, 4, 21, 13, 0, 0)


def test_insitu_ignores_log_notes_header():
    rows = parse_insitu_rows(INS_SNIPPET, station_visit_id=1)
    timestamps = [r[1] for r in rows]
    assert datetime(2026, 4, 21, 10, 34, 0) not in timestamps
    assert len(rows) == 3


def test_insitu_station_visit_id_propagated():
    rows = parse_insitu_rows(INS_SNIPPET, station_visit_id=42)
    assert all(r[0] == 42 for r in rows)


def test_insitu_handles_crlf():
    crlf = INS_SNIPPET.replace("\n", "\r\n")
    assert parse_insitu_rows(crlf, station_visit_id=7) == parse_insitu_rows(
        INS_SNIPPET, station_visit_id=7
    )