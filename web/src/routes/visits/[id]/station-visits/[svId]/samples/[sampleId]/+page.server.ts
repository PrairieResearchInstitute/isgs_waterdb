import { db } from '$lib/server/db';
import {
	samples,
	stationVisits,
	stations,
	visits,
	sites,
	sondeImportQueue,
	sondeData
} from '$lib/server/schema';
import { latestVersionOf, stationVersion } from '$lib/server/stations';
import { eq, asc } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { ensureBucket, uploadFile } from '$lib/server/storage';

export const load: PageServerLoad = async ({ params }) => {
	const visitId = parseInt(params.id);
	const svId = parseInt(params.svId);
	const sampleId = parseInt(params.sampleId);
	if (isNaN(visitId) || isNaN(svId) || isNaN(sampleId)) throw error(404, 'Not found');

	const [sampleRows, svRows, sondeRows] = await Promise.all([
		db.select().from(samples).where(eq(samples.id, sampleId)).limit(1),
		db
			.select({
				stationName: stations.staName,
				visitId: stationVisits.visitId,
				siteName: sites.idotName
			})
			.from(stationVisits)
			.leftJoin(stationVersion, eq(stationVisits.stationId, stationVersion.id))
			.leftJoin(stations, latestVersionOf(stationVersion))
			.leftJoin(visits, eq(stationVisits.visitId, visits.id))
			.leftJoin(sites, eq(visits.siteId, sites.id))
			.where(eq(stationVisits.id, svId))
			.limit(1),
		db
			.select()
			.from(sondeData)
			.where(eq(sondeData.sampleId, sampleId))
			.orderBy(asc(sondeData.timestamp))
	]);

	if (sampleRows.length === 0) throw error(404, 'Sample not found');
	if (svRows.length === 0) throw error(404, 'Station visit not found');

	return {
		sample: sampleRows[0],
		stationName: svRows[0].stationName,
		siteName: svRows[0].siteName,
		visitId,
		svId,
		sondeRows
	};
};

export const actions: Actions = {
	updateSample: async ({ request, params }) => {
		const visitId = parseInt(params.id);
		const svId = parseInt(params.svId);
		const sampleId = parseInt(params.sampleId);
		const data = await request.formData();
		const flowRateRaw = data.get('flowRate') as string;
		const finalFlowRateRaw = data.get('finalFlowRate') as string;
		await db
			.update(samples)
			.set({
				sampleName: (data.get('sampleName') as string) || null,
				notes: (data.get('notes') as string) || null,
				pumpType: (data.get('pumpType') as string) || null,
				flowRate: flowRateRaw ? parseFloat(flowRateRaw) : null,
				finalFlowRate: finalFlowRateRaw ? parseFloat(finalFlowRateRaw) : null,
				tubingType: (data.get('tubingType') as string) || null,
				deviceModel: (data.get('deviceModel') as string) || null,
				deviceSn: (data.get('deviceSn') as string) || null
			})
			.where(eq(samples.id, sampleId));
		redirect(303, `/visits/${visitId}/station-visits/${svId}/samples/${sampleId}`);
	},

	deleteSample: async ({ params }) => {
		const visitId = parseInt(params.id);
		const svId = parseInt(params.svId);
		const sampleId = parseInt(params.sampleId);
		await db.delete(samples).where(eq(samples.id, sampleId));
		redirect(303, `/visits/${visitId}/station-visits/${svId}`);
	},

	uploadSonde: async ({ request, params }) => {
		const sampleId = parseInt(params.sampleId);
		const data = await request.formData();
		const file = data.get('file');
		if (!(file instanceof File) || file.size === 0) return {};
		if (!file.name.toLowerCase().endsWith('.csv')) return {};

		await ensureBucket('watershed');
		const key = `WaterSamplingFieldData/${Date.now()}-${file.name}`;
		await uploadFile('watershed', key, await file.arrayBuffer(), 'text/csv');
		await db.insert(sondeImportQueue).values({ sampleId, uri: `s3://watershed/${key}` });

		return {};
	}
};
