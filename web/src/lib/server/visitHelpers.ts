import { db } from './db';
import { visits, stations, stationVisits } from './schema';
import { isCurrent } from './stations';
import { and, eq } from 'drizzle-orm';
import type { NewVisit } from './schema';

export async function createVisitWithStations(values: NewVisit): Promise<void> {
	const [newVisit] = await db.insert(visits).values(values).returning();

	// Link the visit to the current version of each active station at the site.
	const siteStations = await db
		.select({ id: stations.id })
		.from(stations)
		.where(and(eq(stations.siteId, values.siteId), isCurrent()));

	if (siteStations.length > 0) {
		await db
			.insert(stationVisits)
			.values(siteStations.map((s) => ({ visitId: newVisit.id, stationId: s.id })));
	}
}
