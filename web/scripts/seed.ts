import { readFileSync } from 'fs';
import { resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/server/schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const client = postgres(connectionString);
const db = drizzle(client, { schema });

function parseNdjson<T>(filePath: string): T[] {
	return readFileSync(filePath, 'utf-8')
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as T);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
	return chunks;
}

function parseDate(raw: string | undefined | null): string | null {
	if (!raw) return null;
	// Format: "MM/DD/YY HH:MM:SS" or "MM/DD/YYYY HH:MM:SS"
	const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
	if (!match) return null;
	const [, mm, dd, yy] = match;
	const year = yy.length === 2 ? (parseInt(yy) < 50 ? `20${yy}` : `19${yy}`) : yy;
	return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

const dataDir = resolve(import.meta.dirname, '../../data');

async function main() {
	// Seed LUT_SiteType
	const siteTypeRows = parseNdjson<{ ID: number; SiteType: string }>(
		`${dataDir}/LUT_SiteType.json`
	);
	await db
		.insert(schema.lutSiteType)
		.values(siteTypeRows.map((r) => ({ id: r.ID, siteType: r.SiteType })))
		.onConflictDoNothing();
	console.log(`Seeded ${siteTypeRows.length} site types`);

	// Seed LUT_County_Names
	const countyRows = parseNdjson<{ CNTYCODE: number; CNTYNAME: string }>(
		`${dataDir}/LUT_County_Names.json`
	);
	await db
		.insert(schema.lutCountyNames)
		.values(countyRows.map((r) => ({ cntycode: r.CNTYCODE, cntyname: r.CNTYNAME })))
		.onConflictDoNothing();
	console.log(`Seeded ${countyRows.length} county names`);

	// Seed Projects
	type RawProject = {
		ID: number;
		ISGS_Num?: string;
		IDOT_Name?: string;
		ISGS_Name?: string;
		BeginDT?: string;
		EndDT?: string;
		FA_num?: string;
		County?: string;
		TypeID?: number;
		SeqCode?: string;
	};
	const projectRows = parseNdjson<RawProject>(`${dataDir}/Projects.json`);
	await db
		.insert(schema.sites)
		.values(
			projectRows.map((r) => ({
				id: r.ID,
				isgsNum: r.ISGS_Num ?? null,
				idotName: r.IDOT_Name ?? null,
				isgsName: r.ISGS_Name ?? r.IDOT_Name ?? `Site ${r.ID}`,
				beginDt: parseDate(r.BeginDT),
				endDt: parseDate(r.EndDT),
				faNum: r.FA_num ?? null,
				county: r.County ? parseInt(r.County) : null,
				typeId: r.TypeID ?? null,
				seqCode: r.SeqCode ?? null
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${projectRows.length} sites`);

	// Seed LUTC_Initials
	type RawInitials = { Initials: string; FirstName?: string; LastName?: string };
	const initialsRows = parseNdjson<RawInitials>(`${dataDir}/LUTC_Initials.json`);
	await db
		.insert(schema.lutcInitials)
		.values(
			initialsRows.map((r) => ({
				initials: r.Initials,
				firstName: r.FirstName ?? null,
				lastName: r.LastName ?? null
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${initialsRows.length} initials`);

	// Seed Visits
	type RawVisit = {
		ID: number;
		ProjectID: number;
		DT: string;
		By: string;
		Note?: string;
		ReviewedBy?: string;
		ReviewedDate?: string;
	};
	const visitRows = parseNdjson<RawVisit>(`${dataDir}/Visits.json`);

	// Ensure all initials referenced by visits exist in lutcInitials
	const referencedInitials = Array.from(
		new Set(visitRows.flatMap((r) => [r.By, ...(r.ReviewedBy ? [r.ReviewedBy] : [])]))
	);
	await db
		.insert(schema.lutcInitials)
		.values(referencedInitials.map((i) => ({ initials: i, firstName: null, lastName: null })))
		.onConflictDoNothing();
	await db
		.insert(schema.visits)
		.values(
			visitRows.map((r) => ({
				id: r.ID,
				siteId: r.ProjectID,
				dt: parseDate(r.DT),
				by: r.By,
				note: r.Note ?? null,
				reviewedBy: r.ReviewedBy ?? null,
				reviewedDate: parseDate(r.ReviewedDate)
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${visitRows.length} visits`);

	// Seed LUT_Station_Type
	type RawStationType = { ID: number; Type: string; ShortType?: string };
	const stationTypeRows = parseNdjson<RawStationType>(`${dataDir}/LUT_Station_Type.json`);
	await db
		.insert(schema.lutStationType)
		.values(
			stationTypeRows.map((r) => ({ id: r.ID, type: r.Type, shortType: r.ShortType ?? null }))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${stationTypeRows.length} station types`);

	// Seed LUT_LocationType
	type RawLocationType = { ID: number; LocationType: string };
	const locationTypeRows = parseNdjson<RawLocationType>(`${dataDir}/LUT_LocationType.json`);
	await db
		.insert(schema.lutLocationType)
		.values(locationTypeRows.map((r) => ({ id: r.ID, locationType: r.LocationType })))
		.onConflictDoNothing();
	console.log(`Seeded ${locationTypeRows.length} location types`);

	// Seed LUT_Station_InstType
	type RawInstType = { ID: number; InstType: string; WLE_Equation?: string };
	const instTypeRows = parseNdjson<RawInstType>(`${dataDir}/LUT_Station_InstType.json`);
	await db
		.insert(schema.lutStationInstType)
		.values(
			instTypeRows.map((r) => ({
				id: r.ID,
				instType: r.InstType,
				wleEquation: r.WLE_Equation ?? null
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${instTypeRows.length} instrument types`);

	// Seed LUT_Station_Units
	type RawStationUnits = { ID: number; Units_Reading: string; Conv_Factor?: number };
	const stationUnitsRows = parseNdjson<RawStationUnits>(`${dataDir}/LUT_Station_Units.json`);
	await db
		.insert(schema.lutStationUnits)
		.values(
			stationUnitsRows.map((r) => ({
				id: r.ID,
				unitsReading: r.Units_Reading,
				convFactor: r.Conv_Factor ?? null
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${stationUnitsRows.length} station units`);

	// Seed LUT_Station_ReadType
	type RawReadType = {
		ID: number;
		LoggerType: string;
		ReadType: string;
		IDRT: number;
		LoggerTypeShort?: string;
		IsWQ: number;
		SortOrder?: number;
	};
	const readTypeRows = parseNdjson<RawReadType>(`${dataDir}/LUT_Station_ReadType.json`);
	await db
		.insert(schema.lutStationReadType)
		.values(
			readTypeRows.map((r) => ({
				id: r.ID,
				loggerType: r.LoggerType,
				readType: r.ReadType,
				idrt: r.IDRT,
				loggerTypeShort: r.LoggerTypeShort ?? null,
				isWQ: r.IsWQ,
				sortOrder: r.SortOrder ?? null
			}))
		)
		.onConflictDoNothing();
	console.log(`Seeded ${readTypeRows.length} read types`);

	// Seed LUT_Status
	type RawStatus = { ID: number; Status: string };
	const statusRows = parseNdjson<RawStatus>(`${dataDir}/LUT_Status.json`);
	await db
		.insert(schema.lutStatus)
		.values(statusRows.map((r) => ({ id: r.ID, status: r.Status })))
		.onConflictDoNothing();
	console.log(`Seeded ${statusRows.length} statuses`);

	// Seed LUT_BoringMethod
	type RawBoringMethod = { ID: number; BoringMethod: string };
	const boringMethodRows = parseNdjson<RawBoringMethod>(`${dataDir}/LUT_BoringMethod.json`);
	await db
		.insert(schema.lutBoringMethod)
		.values(boringMethodRows.map((r) => ({ id: r.ID, boringMethod: r.BoringMethod })))
		.onConflictDoNothing();
	console.log(`Seeded ${boringMethodRows.length} boring methods`);

	// Seed Stations
	type RawStation = {
		ID: number;
		ProjectID: number;
		TypeID: number;
		Code?: string;
		BeginDT?: string;
		EndDT?: string;
		StaName: string;
		LabelAlt?: string;
		Longitude?: number;
		Latitude?: number;
		LocationTypeID?: number;
		Initials: string;
		InstTypeID?: number;
		InstUnitsID?: number;
		StationTypeID?: number;
		ISGS_ID?: string;
		BorDT?: string;
		BorMethodID?: number;
		Comment?: string;
	};
	const stationRows = parseNdjson<RawStation>(`${dataDir}/Stations.json`);

	// Stations are a slowly changing dimension keyed by (site_id, code), so a code may be
	// used by only one current station per site. The source data reuses some codes at a site
	// for stations of different types: the lowest ID keeps the code, and later duplicates get
	// `${code}-${typeId}`. Missing codes fall back to the station ID.
	const stationCodes = new Map<number, string>();
	const usedCodes = new Set<string>();
	for (const r of [...stationRows].sort((a, b) => a.ID - b.ID)) {
		let code = r.Code?.trim() || String(r.ID);
		if (usedCodes.has(`${r.ProjectID}|${code}`)) {
			const renamed = `${code}-${r.TypeID}`;
			console.warn(
				`Station ${r.ID}: code "${code}" already used at site ${r.ProjectID}; using "${renamed}"`
			);
			code = renamed;
		}
		usedCodes.add(`${r.ProjectID}|${code}`);
		stationCodes.set(r.ID, code);
	}

	// Every seeded station is a single, currently valid version.
	const seededAt = new Date().toISOString();
	const stationValues = stationRows.map((r) => ({
		id: r.ID,
		siteId: r.ProjectID,
		typeId: r.TypeID,
		code: stationCodes.get(r.ID)!,
		validFrom: seededAt,
		validTo: 'infinity',
		beginDt: parseDate(r.BeginDT),
		endDt: parseDate(r.EndDT),
		staName: r.StaName,
		labelAlt: r.LabelAlt ?? null,
		longitude: r.Longitude ?? null,
		latitude: r.Latitude ?? null,
		locationTypeId: r.LocationTypeID ?? null,
		initials: r.Initials,
		instTypeId: r.InstTypeID ?? null,
		instUnitsId: r.InstUnitsID ?? null,
		stationTypeId: r.StationTypeID ?? null,
		isgsId: r.ISGS_ID ?? null,
		borDt: parseDate(r.BorDT),
		borMethodId: r.BorMethodID ?? null,
		comment: r.Comment ?? null
	}));
	for (const chunk of chunkArray(stationValues, 50)) {
		await db.insert(schema.stations).values(chunk).onConflictDoNothing();
	}
	console.log(`Seeded ${stationRows.length} stations`);

	// Seed SO_Read → stationVisits
	type RawSoRead = {
		VisitID: number;
		StationID: number;
		Level?: number;
		Note?: string;
		StatusID?: number;
	};
	const soReadRows = parseNdjson<RawSoRead>(`${dataDir}/SO_Read.json`);

	// Groundwater (GW) stations record level in meters; all others in feet. Route each source
	// Level into the matching column based on the station's type.
	const shortTypeByTypeId = new Map(stationTypeRows.map((r) => [r.ID, r.ShortType ?? null]));
	const shortTypeByStationId = new Map(
		stationRows.map((r) => [r.ID, shortTypeByTypeId.get(r.TypeID) ?? null])
	);
	const soReadValues = soReadRows.map((r) => {
		const isGW = shortTypeByStationId.get(r.StationID) === 'GW';
		const level = r.Level ?? null;
		return {
			visitId: r.VisitID,
			stationId: r.StationID,
			levelMeters: isGW && level != null ? level.toFixed(3) : null,
			levelFeet: !isGW && level != null ? level.toFixed(2) : null,
			notes: r.Note ?? null,
			statusId: r.StatusID ?? null
		};
	});
	for (const chunk of chunkArray(soReadValues, 50)) {
		await db.insert(schema.stationVisits).values(chunk).onConflictDoNothing();
	}
	console.log(`Seeded ${soReadRows.length} station visits`);

	// Sync sequences so subsequent inserts get correct auto-incremented IDs
	await db.execute(sql`SELECT setval('sites_id_seq', (SELECT MAX(id) FROM sites))`);
	await db.execute(sql`SELECT setval('visits_id_seq', (SELECT MAX(id) FROM visits))`);
	await db.execute(sql`SELECT setval('stations_id_seq', (SELECT MAX(id) FROM stations))`);
	await db.execute(
		sql`SELECT setval('station_visits_id_seq', COALESCE((SELECT MAX(id) FROM station_visits), 1))`
	);
	console.log('Sequences synced');

	await client.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
