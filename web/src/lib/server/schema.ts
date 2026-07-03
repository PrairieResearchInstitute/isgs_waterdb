import {
	pgTable,
	integer,
	text,
	doublePrecision,
	numeric,
	serial,
	real,
	time,
	timestamp,
	varchar,
	boolean,
	foreignKey
} from 'drizzle-orm/pg-core';

export const lutSiteType = pgTable('lut_site_type', {
	id: integer('id').primaryKey(),
	siteType: text('site_type').notNull()
});

export const lutCountyNames = pgTable('lut_county_names', {
	cntycode: integer('cntycode').primaryKey(),
	cntyname: text('cntyname')
});

export const sites = pgTable('sites', {
	id: serial('id').primaryKey(),
	isgsNum: text('isgs_num'),
	idotName: text('idot_name'),
	isgsName: text('isgs_name').notNull(),
	beginDt: text('begin_dt'),
	endDt: text('end_dt'),
	faNum: text('fa_num'),
	county: integer('county').references(() => lutCountyNames.cntycode),
	typeId: integer('type_id').references(() => lutSiteType.id),
	seqCode: text('seq_code')
});

export const lutcInitials = pgTable('lutc_initials', {
	initials: text('initials').primaryKey(),
	firstName: text('first_name'),
	lastName: text('last_name')
});

export const visits = pgTable('visits', {
	id: serial('id').primaryKey(),
	siteId: integer('site_id')
		.notNull()
		.references(() => sites.id),
	dt: text('dt'),
	by: text('by')
		.notNull()
		.references(() => lutcInitials.initials),
	note: text('note'),
	reviewedBy: text('reviewed_by').references(() => lutcInitials.initials),
	reviewedDate: text('reviewed_date')
});

export const lutStationType = pgTable('lut_station_type', {
	id: integer('id').primaryKey(),
	type: text('type').notNull(),
	shortType: text('short_type')
});

export const lutLocationType = pgTable('lut_location_type', {
	id: integer('id').primaryKey(),
	locationType: text('location_type').notNull()
});

export const lutStationInstType = pgTable('lut_station_inst_type', {
	id: integer('id').primaryKey(),
	instType: text('inst_type').notNull(),
	wleEquation: text('wle_equation')
});

export const lutStationUnits = pgTable('lut_station_units', {
	id: integer('id').primaryKey(),
	unitsReading: text('units_reading').notNull(),
	convFactor: doublePrecision('conv_factor')
});

export const lutStationReadType = pgTable('lut_station_read_type', {
	id: integer('id').primaryKey(),
	loggerType: text('logger_type').notNull(),
	readType: text('read_type').notNull(),
	idrt: integer('idrt').notNull(),
	loggerTypeShort: text('logger_type_short'),
	isWQ: integer('is_wq').notNull(),
	sortOrder: integer('sort_order')
});

export const lutBoringMethod = pgTable('lut_boring_method', {
	id: integer('id').primaryKey(),
	boringMethod: text('boring_method').notNull()
});

export const lutStatus = pgTable('lut_status', {
	id: integer('id').primaryKey(),
	status: text('status').notNull()
});

export const stations = pgTable('stations', {
	id: serial('id').primaryKey(),
	siteId: integer('site_id')
		.notNull()
		.references(() => sites.id),
	typeId: integer('type_id')
		.notNull()
		.references(() => lutStationType.id),
	code: text('code'),
	beginDt: text('begin_dt'),
	endDt: text('end_dt'),
	staName: text('sta_name').notNull(),
	labelAlt: text('label_alt'),
	longitude: doublePrecision('longitude'),
	latitude: doublePrecision('latitude'),
	locationTypeId: integer('location_type_id').references(() => lutLocationType.id),
	initials: text('initials')
		.notNull()
		.references(() => lutcInitials.initials),
	instTypeId: integer('inst_type_id').references(() => lutStationInstType.id),
	instUnitsId: integer('inst_units_id').references(() => lutStationUnits.id),
	stationTypeId: integer('station_type_id').references(() => lutStationReadType.id),
	isgsId: text('isgs_id'),
	borDt: text('bor_dt'),
	borMethodId: integer('bor_method_id').references(() => lutBoringMethod.id),
	comment: text('comment')
});

export type LutSiteType = typeof lutSiteType.$inferSelect;
export type LutCountyName = typeof lutCountyNames.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type LutcInitials = typeof lutcInitials.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
export type LutStationType = typeof lutStationType.$inferSelect;
export type LutLocationType = typeof lutLocationType.$inferSelect;
export type LutStationInstType = typeof lutStationInstType.$inferSelect;
export type LutStationUnits = typeof lutStationUnits.$inferSelect;
export type LutStationReadType = typeof lutStationReadType.$inferSelect;
export type LutBoringMethod = typeof lutBoringMethod.$inferSelect;
export type LutStatus = typeof lutStatus.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;

export const stationVisits = pgTable('station_visits', {
	id: serial('id').primaryKey(),
	visitId: integer('visit_id')
		.notNull()
		.references(() => visits.id),
	stationId: integer('station_id')
		.notNull()
		.references(() => stations.id),
	statusId: integer('status_id').references(() => lutStatus.id),
	levelMeters: numeric('level_meters', { precision: 10, scale: 3 }),
	levelFeet: numeric('level_feet', { precision: 10, scale: 2 }),
	time: time('time'),
	notes: text('notes')
});

export type StationVisit = typeof stationVisits.$inferSelect;
export type NewStationVisit = typeof stationVisits.$inferInsert;

export const pressureTemperatureDepth = pgTable(
	'pressure_temperature_depth',
	{
		id: serial('id').primaryKey(),
		stationVisitId: integer('station_visit_id').notNull(),
		timestamp: timestamp('timestamp', { withTimezone: false }),
		pressure: real('pressure'),
		temperature: real('temperature'),
		depth: real('depth'),
		specificConductivity: real('specific_conductivity'),
		barometricPressure: real('barometric_pressure'),
		includeInReport: boolean('include_in_report').notNull().default(true)
	},
	(table) => [
		foreignKey({
			columns: [table.stationVisitId],
			foreignColumns: [stationVisits.id],
			name: 'ptd_station_visit_id_fk'
		})
	]
);

export type PressureTemperatureDepth = typeof pressureTemperatureDepth.$inferSelect;
export type NewPressureTemperatureDepth = typeof pressureTemperatureDepth.$inferInsert;

export const stationVisitImportQueue = pgTable(
	'station_visit_import_queue',
	{
		id: serial('id').primaryKey(),
		stationVisitId: integer('station_visit_id').notNull(),
		uri: text('uri').notNull(),
		timestamp: timestamp('timestamp').notNull().defaultNow()
	},
	(table) => [
		foreignKey({
			columns: [table.stationVisitId],
			foreignColumns: [stationVisits.id],
			name: 'sviq_station_visit_id_fk'
		})
	]
);

export type StationVisitImportQueueEntry = typeof stationVisitImportQueue.$inferSelect;
export type NewStationVisitImportQueueEntry = typeof stationVisitImportQueue.$inferInsert;

export const samples = pgTable('samples', {
	id: serial('id').primaryKey(),
	visitId: integer('visit_id')
		.notNull()
		.references(() => visits.id),
	stationVisitId: integer('station_visit_id').references(() => stationVisits.id),
	sampleName: varchar('sample_name', { length: 32 }),
	notes: text('notes'),
	pumpType: text('pump_type'),
	flowRate: real('flow_rate'),
	finalFlowRate: real('final_flow_rate'),
	tubingType: text('tubing_type'),
	deviceModel: text('device_model'),
	deviceSn: text('device_sn')
});

export type Sample = typeof samples.$inferSelect;
export type NewSample = typeof samples.$inferInsert;

export const sondeImportQueue = pgTable(
	'sonde_import_queue',
	{
		id: serial('id').primaryKey(),
		sampleId: integer('sample_id').notNull(),
		uri: text('uri').notNull(),
		timestamp: timestamp('timestamp').notNull().defaultNow()
	},
	(table) => [
		foreignKey({
			columns: [table.sampleId],
			foreignColumns: [samples.id],
			name: 'siq_sample_id_fk'
		})
	]
);

export type SondeImportQueueEntry = typeof sondeImportQueue.$inferSelect;
export type NewSondeImportQueueEntry = typeof sondeImportQueue.$inferInsert;

export const sondeData = pgTable(
	'sonde_data',
	{
		id: serial('id').primaryKey(),
		sampleId: integer('sample_id').notNull(),
		timestamp: timestamp('timestamp', { withTimezone: false }),
		elapsedTime: text('elapsed_time'),
		flow: real('flow'),
		actualConductivity: real('actual_conductivity'),
		specificConductivity: real('specific_conductivity'),
		salinity: real('salinity'),
		resistivity: real('resistivity'),
		density: real('density'),
		totalDissolvedSolids: real('total_dissolved_solids'),
		turbidity: real('turbidity'),
		ph: real('ph'),
		phMv: real('ph_mv'),
		orp: real('orp'),
		rdoConcentration: real('rdo_concentration'),
		rdoSaturation: real('rdo_saturation'),
		oxygenPartialPressure: real('oxygen_partial_pressure'),
		temperature: real('temperature'),
		externalVoltage: real('external_voltage'),
		batteryCapacity: real('battery_capacity'),
		barometricPressure: real('barometric_pressure')
	},
	(table) => [
		foreignKey({
			columns: [table.sampleId],
			foreignColumns: [samples.id],
			name: 'sd_sample_id_fk'
		})
	]
);

export type SondeData = typeof sondeData.$inferSelect;
export type NewSondeData = typeof sondeData.$inferInsert;
