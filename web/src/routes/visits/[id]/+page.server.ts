import { db } from '$lib/server/db';
import {
	visits,
	sites,
	lutcInitials,
	stations,
	stationVisits,
	lutStationType,
	lutStatus,
	samples
} from '$lib/server/schema';
import { latestVersionOf, stationVersion } from '$lib/server/stations';
import { eq, asc } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) throw error(404, 'Visit not found');

	const [rows, svRows, allSites, scientists, bottles] = await Promise.all([
		db
			.select({
				id: visits.id,
				dt: visits.dt,
				siteId: visits.siteId,
				siteName: sites.isgsName,
				by: visits.by,
				scientistFirst: lutcInitials.firstName,
				scientistLast: lutcInitials.lastName,
				note: visits.note,
				reviewedBy: visits.reviewedBy,
				reviewedDate: visits.reviewedDate
			})
			.from(visits)
			.leftJoin(sites, eq(visits.siteId, sites.id))
			.leftJoin(lutcInitials, eq(visits.by, lutcInitials.initials))
			.where(eq(visits.id, id))
			.limit(1),
		db
			.select({
				id: stationVisits.id,
				stationId: stationVisits.stationId,
				staName: stations.staName,
				code: stations.code,
				time: stationVisits.time,
				levelMeters: stationVisits.levelMeters,
				levelFeet: stationVisits.levelFeet,
				shortType: lutStationType.shortType,
				statusId: stationVisits.statusId,
				status: lutStatus.status,
				notes: stationVisits.notes
			})
			.from(stationVisits)
			.leftJoin(stationVersion, eq(stationVisits.stationId, stationVersion.id))
			.leftJoin(stations, latestVersionOf(stationVersion))
			.leftJoin(lutStationType, eq(stations.typeId, lutStationType.id))
			.leftJoin(lutStatus, eq(stationVisits.statusId, lutStatus.id))
			.where(eq(stationVisits.visitId, id))
			.orderBy(asc(stations.staName)),
		db
			.select({ id: sites.id, isgsName: sites.isgsName, isgsNum: sites.isgsNum })
			.from(sites)
			.orderBy(asc(sites.isgsName)),
		db.select().from(lutcInitials).orderBy(asc(lutcInitials.lastName), asc(lutcInitials.firstName)),
		db
			.select({
				id: samples.id,
				sampleName: samples.sampleName,
				stationVisitId: samples.stationVisitId,
				staName: stations.staName
			})
			.from(samples)
			.leftJoin(stationVisits, eq(samples.stationVisitId, stationVisits.id))
			.leftJoin(stationVersion, eq(stationVisits.stationId, stationVersion.id))
			.leftJoin(stations, latestVersionOf(stationVersion))
			.where(eq(samples.visitId, id))
			.orderBy(asc(samples.sampleName))
	]);

	if (rows.length === 0) throw error(404, 'Visit not found');

	return {
		visit: rows[0],
		stationVisits: svRows,
		sites: allSites,
		scientists,
		bottles
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const id = parseInt(params.id);
		if (isNaN(id)) return fail(400, { error: 'Invalid visit id' });

		const data = await request.formData();
		const siteIdRaw = data.get('siteId') as string;
		const by = (data.get('by') as string)?.trim();

		if (!siteIdRaw) return fail(400, { error: 'Site is required' });
		if (!by) return fail(400, { error: 'Field Scientist is required' });

		const siteId = parseInt(siteIdRaw);
		if (isNaN(siteId)) return fail(400, { error: 'Invalid site' });

		await db
			.update(visits)
			.set({
				siteId,
				by,
				dt: (data.get('dt') as string) || null,
				note: (data.get('note') as string) || null
			})
			.where(eq(visits.id, id));

		return { success: true };
	},

	allocateBottles: async ({ params, request }) => {
		const id = parseInt(params.id);
		if (isNaN(id)) return fail(400, { error: 'Invalid visit id' });

		const data = await request.formData();
		const shortCode = (data.get('shortCode') as string)?.trim();
		const startNumber = parseInt(data.get('startNumber') as string);
		const count = parseInt(data.get('count') as string);

		if (!shortCode) return fail(400, { error: 'Site short code is required' });
		if (isNaN(startNumber) || startNumber < 0)
			return fail(400, { error: 'Starting bottle number must be 0 or greater' });
		if (isNaN(count) || count < 1) return fail(400, { error: 'Count must be at least 1' });
		if (count > 500) return fail(400, { error: 'Cannot allocate more than 500 bottles at once' });

		const rows = [];
		for (let n = startNumber; n < startNumber + count; n++) {
			const sampleName = `${shortCode}_${String(n).padStart(3, '0')}`;
			if (sampleName.length > 32)
				return fail(400, {
					error: 'Sample names exceed 32 characters — use a shorter short code'
				});
			rows.push({ visitId: id, stationVisitId: null, sampleName });
		}

		await db.insert(samples).values(rows);

		return { success: true };
	}
};
