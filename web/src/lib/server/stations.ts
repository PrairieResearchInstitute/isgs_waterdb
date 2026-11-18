import { and, eq, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { stations } from './schema';

/**
 * `stations` is a type 2 slowly changing dimension: every version of a station shares the
 * durable key (site_id, code), and the current version has valid_to = 'infinity'.
 */

/** Filter for the currently valid version of a station row. */
export function isCurrent(table: { validTo: AnyPgColumn } = stations): SQL {
	return sql`${table.validTo} = 'infinity'`;
}

/** The specific station version a station visit was recorded against. */
export const stationVersion = alias(stations, 'station_version');

/**
 * Join condition from a station version row to the latest version of the same station
 * (selected as `stations`). That is the current version, or the last version if the
 * station has been retired.
 */
export function latestVersionOf(version: typeof stationVersion): SQL {
	return and(
		eq(stations.siteId, version.siteId),
		eq(stations.code, version.code),
		sql`${stations.validTo} = (
			SELECT max(s2.valid_to) FROM stations s2
			WHERE s2.site_id = ${version.siteId} AND s2.code = ${version.code}
		)`
	)!;
}
