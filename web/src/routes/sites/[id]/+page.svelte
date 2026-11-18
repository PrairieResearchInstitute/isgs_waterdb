<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { closeOnSuccess } from '$lib/forms';
	import { formatDate } from '$lib/format';
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Button from '$lib/components/Button.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextareaField from '$lib/components/TextareaField.svelte';
	import TableHeader from '$lib/components/TableHeader.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dialogOpen = $state(false);
	let stationDialogOpen = $state(false);
	let visitDialogOpen = $state(false);
	let editingStation = $state<(typeof data.stations)[0] | null>(null);

	function openAddStation() {
		editingStation = null;
		stationDialogOpen = true;
	}

	function openEditStation(station: (typeof data.stations)[0]) {
		editingStation = station;
		stationDialogOpen = true;
	}
</script>

<svelte:head>
	<title>{data.site.isgsName ?? 'Site'} | IDOT Wetlands Data</title>
</svelte:head>

<!-- Top bar -->
<div class="flex items-center justify-between mb-6">
	<a
		href="/"
		class="text-sm font-sans font-semibold text-il-storm hover:text-il-blue transition-colors"
	>
		← Sites
	</a>
	<Button onclick={() => (dialogOpen = true)} class="inline-flex items-center gap-2">Edit</Button>
</div>

<!-- Site detail card -->
<div class="border border-il-cloud rounded-lg shadow-sm bg-white overflow-hidden">
	<div class="px-6 py-4 bg-il-storm-95 border-b border-il-cloud">
		<h1 class="font-heading font-bold text-2xl text-il-blue">{data.site.isgsName ?? '—'}</h1>
	</div>

	<dl class="grid grid-cols-2 gap-x-8 gap-y-5 px-6 py-5 font-sans">
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">ISGS #</dt>
			<dd class="font-mono text-il-storm-30">{data.site.isgsNum ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">IDOT Name</dt>
			<dd class="text-il-storm-30">{data.site.idotName ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">FA #</dt>
			<dd class="text-il-storm-30">{data.site.faNum ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">County</dt>
			<dd class="text-il-storm-30">{data.site.countyName ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">Type</dt>
			<dd class="text-il-storm-30">{data.site.siteType ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">Seq Code</dt>
			<dd class="text-il-storm-30">{data.site.seqCode ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">Begin Date</dt>
			<dd class="text-il-storm-30">{formatDate(data.site.beginDt)}</dd>
		</div>
		<div>
			<dt class="text-xs font-semibold text-il-storm uppercase tracking-wide mb-1">End Date</dt>
			<dd class="text-il-storm-30">{formatDate(data.site.endDt)}</dd>
		</div>
	</dl>
</div>

<!-- Stations section -->
<div class="mt-8">
	<div class="flex items-center justify-between mb-4">
		<h2 class="font-heading font-bold text-xl text-il-blue">Stations</h2>
		<Button onclick={openAddStation} class="inline-flex items-center gap-2">Add Station</Button>
	</div>
	{#if data.stations.length === 0}
		<div class="border-2 border-il-cloud rounded p-10 text-center text-il-storm font-sans">
			No stations recorded for this site.
		</div>
	{:else}
		<div class="border border-il-cloud rounded overflow-hidden shadow-sm">
			<div class="overflow-y-auto max-h-[440px]">
				<table class="w-full text-sm font-sans">
					<TableHeader sticky>
						<tr>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Name</th>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Code</th>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Type</th>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Location</th>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide"
								>Station Type</th
							>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide"
								>Instrument Type</th
							>
							<th class="px-4 py-3"></th>
						</tr>
					</TableHeader>
					<tbody>
						{#each data.stations as station (station.id)}
							<tr
								class="border-b border-il-cloud last:border-0 hover:bg-il-storm-95 transition-colors"
							>
								<td class="px-4 py-3 font-semibold text-il-storm-30">{station.staName}</td>
								<td class="px-4 py-3 font-mono text-il-storm">{station.code ?? '—'}</td>
								<td class="px-4 py-3 text-il-storm"
									>{station.stationTypeShort ?? station.stationType ?? '—'}</td
								>
								<td class="px-4 py-3 text-il-storm">{station.locationType ?? '—'}</td>
								<td class="px-4 py-3 text-il-storm">
									{station.loggerType && station.readType
										? `${station.loggerType} — ${station.readType}`
										: (station.loggerType ?? station.readType ?? '—')}
								</td>
								<td class="px-4 py-3 text-il-storm">{station.instType ?? '—'}</td>
								<td class="px-4 py-3">
									<button
										type="button"
										onclick={() => openEditStation(station)}
										class="text-xs font-sans font-semibold text-il-blue hover:underline"
									>
										Edit
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- Visits table -->
<div class="mt-8">
	<div class="flex items-center justify-between mb-4">
		<h2 class="font-heading font-bold text-xl text-il-blue">Visits</h2>
		<Button onclick={() => (visitDialogOpen = true)} class="inline-flex items-center gap-2">
			+ New Visit
		</Button>
	</div>
	{#if data.visits.length === 0}
		<div class="border-2 border-il-cloud rounded p-10 text-center text-il-storm font-sans">
			No visits recorded for this site.
		</div>
	{:else}
		<div class="border border-il-cloud rounded overflow-hidden shadow-sm">
			<table class="w-full text-sm font-sans">
				<TableHeader>
					<tr>
						<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Date</th>
						<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide"
							>Field Scientist</th
						>
						<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Note</th>
					</tr>
				</TableHeader>
				<tbody>
					{#each data.visits as visit (visit.id)}
						<tr
							class="border-b border-il-cloud last:border-0 hover:bg-il-storm-95 transition-colors"
						>
							<td class="px-4 py-3 whitespace-nowrap">
								<a href="/visits/{visit.id}" class="text-il-blue hover:underline font-semibold">
									{formatDate(visit.dt)}
								</a>
							</td>
							<td class="px-4 py-3 font-semibold">
								<a href="/maintenance/people/{visit.by}" class="text-il-blue hover:underline">
									{[visit.firstName, visit.lastName].filter(Boolean).join(' ') || visit.by || '—'}
								</a>
							</td>
							<td class="px-4 py-3 text-il-storm-30">{visit.note ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Edit site dialog -->
<AppDialog bind:open={dialogOpen} title="Edit Site" maxWidth="max-w-2xl">
	<form
		method="POST"
		action="?/update"
		use:enhance={closeOnSuccess(() => (dialogOpen = false))}
		class="px-6 py-5 grid grid-cols-2 gap-x-5 gap-y-4"
	>
		<TextField id="isgsNum" name="isgsNum" label="ISGS #" value={data.site.isgsNum ?? ''} />
		<TextField
			id="idotName"
			name="idotName"
			label="IDOT Name"
			required
			value={data.site.idotName ?? ''}
		/>
		<TextField
			id="isgsName"
			name="isgsName"
			label="ISGS Name"
			required
			value={data.site.isgsName ?? ''}
		/>
		<TextField id="faNum" name="faNum" label="FA #" value={data.site.faNum ?? ''} />
		<TextField
			id="beginDt"
			name="beginDt"
			label="Begin Date"
			type="date"
			value={data.site.beginDt ?? ''}
		/>
		<TextField id="endDt" name="endDt" label="End Date" type="date" value={data.site.endDt ?? ''} />

		<SelectField id="county" name="county" label="County" value={data.site.county ?? ''}>
			<option value="">— Select county —</option>
			{#each data.counties as c (c.cntycode)}
				<option value={c.cntycode}>{c.cntyname}</option>
			{/each}
		</SelectField>

		<SelectField id="typeId" name="typeId" label="Type" value={data.site.typeId ?? ''}>
			<option value="">— Select type —</option>
			{#each data.siteTypes as st (st.id)}
				<option value={st.id}>{st.siteType}</option>
			{/each}
		</SelectField>

		<TextField
			id="seqCode"
			name="seqCode"
			label="Seq Code"
			class="col-span-2"
			value={data.site.seqCode ?? ''}
		/>

		<!-- Form actions -->
		<div class="col-span-2 flex items-center justify-end gap-3 pt-2 border-t border-il-cloud mt-1">
			<Button variant="secondary" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button type="submit" class="px-5">Save Changes</Button>
		</div>
	</form>

	<!-- Delete form -->
	<div class="px-6 pb-5">
		<form method="POST" action="?/delete" use:enhance>
			<Button
				type="submit"
				variant="danger"
				onclick={(e) => {
					if (!confirm('Delete this site? This cannot be undone.')) e.preventDefault();
				}}
			>
				Delete Site
			</Button>
		</form>
	</div>
</AppDialog>

<!-- Station add/edit dialog -->
<AppDialog
	bind:open={stationDialogOpen}
	title={editingStation ? 'Edit Station' : 'Add Station'}
	maxWidth="max-w-3xl"
>
	<form
		method="POST"
		action="?/saveStation"
		use:enhance={closeOnSuccess(() => (stationDialogOpen = false))}
		class="px-6 py-5 grid grid-cols-2 gap-x-5 gap-y-4 overflow-y-auto max-h-[70vh]"
	>
		<input type="hidden" name="stationId" value={editingStation?.id ?? ''} />

		<TextField
			id="staName"
			name="staName"
			label="Station Name"
			required
			value={editingStation?.staName ?? ''}
		/>
		<!-- Code is the station's durable key (with the site), so it can't change after creation. -->
		<TextField
			id="stationCode"
			name="code"
			label="Code"
			required
			readonly={editingStation !== null}
			title={editingStation ? 'Code identifies the station and cannot be changed' : undefined}
			inputClass="read-only:bg-il-storm-95 read-only:cursor-not-allowed"
			value={editingStation?.code ?? ''}
		/>

		<SelectField
			id="stationTypeId"
			name="typeId"
			label="Station Type"
			required
			value={editingStation?.typeId ?? ''}
		>
			<option value="">— Select type —</option>
			{#each data.stationTypes as st (st.id)}
				<option value={st.id}>{st.type}</option>
			{/each}
		</SelectField>

		<SelectField
			id="stationLocationTypeId"
			name="locationTypeId"
			label="Location Type"
			value={editingStation?.locationTypeId ?? ''}
		>
			<option value="">— Select location type —</option>
			{#each data.locationTypes as lt (lt.id)}
				<option value={lt.id}>{lt.locationType}</option>
			{/each}
		</SelectField>

		<TextField
			id="stationBeginDt"
			name="beginDt"
			label="Begin Date"
			type="date"
			value={editingStation?.beginDt ?? ''}
		/>
		<TextField
			id="stationEndDt"
			name="endDt"
			label="End Date"
			type="date"
			value={editingStation?.endDt ?? ''}
		/>
		<TextField
			id="stationLat"
			name="latitude"
			label="Latitude"
			type="number"
			step="any"
			value={editingStation?.latitude ?? ''}
		/>
		<TextField
			id="stationLng"
			name="longitude"
			label="Longitude"
			type="number"
			step="any"
			value={editingStation?.longitude ?? ''}
		/>

		<SelectField
			id="stationInitials"
			name="initials"
			label="Field Scientist"
			required
			value={editingStation?.initials ?? ''}
		>
			<option value="">— Select scientist —</option>
			{#each data.scientists as s (s.initials)}
				<option value={s.initials}>
					{[s.firstName, s.lastName].filter(Boolean).join(' ')} ({s.initials})
				</option>
			{/each}
		</SelectField>

		<TextField id="isgsId" name="isgsId" label="ISGS ID" value={editingStation?.isgsId ?? ''} />

		<SelectField
			id="stationInstTypeId"
			name="instTypeId"
			label="Instrument Type"
			value={editingStation?.instTypeId ?? ''}
		>
			<option value="">— Select instrument type —</option>
			{#each data.instTypes as it (it.id)}
				<option value={it.id}>{it.instType}</option>
			{/each}
		</SelectField>

		<SelectField
			id="stationUnitsId"
			name="instUnitsId"
			label="Units"
			value={editingStation?.instUnitsId ?? ''}
		>
			<option value="">— Select units —</option>
			{#each data.stationUnits as u (u.id)}
				<option value={u.id}>{u.unitsReading}</option>
			{/each}
		</SelectField>

		<SelectField
			id="stationReadTypeId"
			name="stationTypeId"
			label="Read Type"
			value={editingStation?.stationTypeId ?? ''}
		>
			<option value="">— Select read type —</option>
			{#each data.stationReadTypes as rt (rt.id)}
				<option value={rt.id}>{rt.loggerType} — {rt.readType}</option>
			{/each}
		</SelectField>

		<SelectField
			id="stationBorMethodId"
			name="borMethodId"
			label="Boring Method"
			value={editingStation?.borMethodId ?? ''}
		>
			<option value="">— Select boring method —</option>
			{#each data.boringMethods as bm (bm.id)}
				<option value={bm.id}>{bm.boringMethod}</option>
			{/each}
		</SelectField>

		<TextField
			id="stationBorDt"
			name="borDt"
			label="Boring Date"
			type="date"
			value={editingStation?.borDt ?? ''}
		/>
		<TextField
			id="stationLabelAlt"
			name="labelAlt"
			label="Label Alt"
			value={editingStation?.labelAlt ?? ''}
		/>

		<TextareaField
			id="stationComment"
			name="comment"
			label="Comment"
			class="col-span-2"
			value={editingStation?.comment ?? ''}
			inputClass="resize-none"
		/>

		{#if form?.error}
			<p class="col-span-2 text-sm font-sans text-il-orange" role="alert">{form.error}</p>
		{/if}

		<!-- Form actions -->
		<div class="col-span-2 flex items-center justify-end gap-3 pt-2 border-t border-il-cloud mt-1">
			<Button variant="secondary" onclick={() => (stationDialogOpen = false)}>Cancel</Button>
			<Button type="submit" class="px-5">
				{editingStation ? 'Save Changes' : 'Add Station'}
			</Button>
		</div>
	</form>

	{#if editingStation}
		<div class="px-6 pb-5">
			<form method="POST" action="?/deleteStation" use:enhance>
				<input type="hidden" name="stationId" value={editingStation.id} />
				<Button
					type="submit"
					variant="danger"
					onclick={(e) => {
						if (
							!confirm(
								'Delete this station? It will be removed from this site; its history and past visits are kept.'
							)
						)
							e.preventDefault();
					}}
				>
					Delete Station
				</Button>
			</form>
		</div>
	{/if}
</AppDialog>

<!-- New visit dialog -->
<AppDialog bind:open={visitDialogOpen} title="New Visit">
	<form
		method="POST"
		action="?/addVisit"
		use:enhance={closeOnSuccess(() => (visitDialogOpen = false))}
		class="px-6 py-5 flex flex-col gap-4"
	>
		<SelectField id="visitBy" name="by" label="Field Scientist" required>
			<option value="">— Select scientist —</option>
			{#each data.scientists as s (s.initials)}
				<option value={s.initials}>
					{[s.firstName, s.lastName].filter(Boolean).join(' ') || s.initials} ({s.initials})
				</option>
			{/each}
		</SelectField>

		<TextField id="visitDt" name="dt" label="Date" type="date" />

		<TextareaField id="visitNote" name="note" label="Notes" inputClass="resize-none" />

		<div class="flex items-center justify-end gap-3 pt-2 border-t border-il-cloud mt-1">
			<Button variant="secondary" onclick={() => (visitDialogOpen = false)}>Cancel</Button>
			<Button type="submit" class="px-5">Create Visit</Button>
		</div>
	</form>
</AppDialog>
