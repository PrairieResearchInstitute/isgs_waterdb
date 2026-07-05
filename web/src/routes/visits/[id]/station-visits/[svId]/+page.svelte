<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { closeOnSuccess } from '$lib/forms';
	import { fly } from 'svelte/transition';
	import PtdReviewPanel from './PtdReviewPanel.svelte';
	import AppDialog from '$lib/components/AppDialog.svelte';
	import Button from '$lib/components/Button.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextareaField from '$lib/components/TextareaField.svelte';
	import TableHeader from '$lib/components/TableHeader.svelte';
	import {
		Chart,
		ScatterController,
		LinearScale,
		PointElement,
		LineElement,
		Tooltip,
		Legend
	} from 'chart.js';

	Chart.register(ScatterController, LinearScale, PointElement, LineElement, Tooltip, Legend);

	let { data }: { data: PageData } = $props();

	let selectedFiles = $state<File[]>([]);
	let isDragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	let tempChartCanvas = $state<HTMLCanvasElement | null>(null);
	let ptdChartCanvas = $state<HTMLCanvasElement | null>(null); // pressure + depth

	let showPtdReview = $state(false);

	let sampleDialogOpen = $state(false);

	// Groundwater stations record level in meters; all others in feet. The form shows a single
	// Level input bound to the matching column with a dynamic unit label.
	let isGW = $derived(data.stationVisit.shortType === 'GW');
	let activeLevel = $derived(isGW ? data.stationVisit.levelMeters : data.stationVisit.levelFeet);

	// BaroTROLL (BAR) stations only record temperature and barometric pressure;
	// pressure and depth are NULL, so those displays are replaced by barometric pressure.
	let isBar = $derived(data.stationVisit.shortType === 'BAR');

	// Status is required only when Level is blank. `levelEdited` starts null and the derived
	// falls back to the loaded value so an existing record with a level isn't flagged on load.
	let levelEdited = $state<string | null>(null);
	let statusRequired = $derived(
		(levelEdited ?? (activeLevel != null ? String(activeLevel) : '')).trim() === ''
	);

	function calcStats(vals: number[]) {
		if (!vals.length) return null;
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
		return { min, max, mean, count: vals.length };
	}

	let ptdStats = $derived.by(() => {
		const depths = data.ptdRecords.map((r) => r.depth).filter((v): v is number => v != null);
		const pressures = data.ptdRecords.map((r) => r.pressure).filter((v): v is number => v != null);
		const temps = data.ptdRecords.map((r) => r.temperature).filter((v): v is number => v != null);
		const baros = data.ptdRecords
			.map((r) => r.barometricPressure)
			.filter((v): v is number => v != null);
		return {
			total: data.ptdRecords.length,
			depth: calcStats(depths),
			pressure: calcStats(pressures),
			temperature: calcStats(temps),
			barometricPressure: calcStats(baros)
		};
	});

	$effect(() => {
		if (!tempChartCanvas || !ptdChartCanvas || !data.ptdRecords.length) return;

		const toMs = (r: (typeof data.ptdRecords)[0]) =>
			r.timestamp ? new Date(r.timestamp).getTime() : null;

		const sharedXAxis = {
			title: { display: true, text: 'Time', color: '#707372' },
			ticks: {
				color: '#707372',
				callback: (val: number | string) => new Date(val as number).toLocaleDateString()
			},
			grid: { color: '#E8E9EB' }
		};

		function makeChart(
			canvas: HTMLCanvasElement,
			label: string,
			color: string,
			yField: (r: (typeof data.ptdRecords)[0]) => number | null | undefined,
			yLabel: string
		) {
			const chartData = data.ptdRecords
				.filter((r) => r.includeInReport && toMs(r) != null && yField(r) != null)
				.map((r) => ({ x: toMs(r) as number, y: yField(r) as number }));

			return new Chart(canvas, {
				type: 'scatter',
				data: {
					datasets: [
						{
							label,
							data: chartData,
							borderColor: color,
							backgroundColor: color + '33',
							pointRadius: chartData.length > 500 ? 1 : 3,
							showLine: true,
							borderWidth: 1.5
						}
					]
				},
				options: {
					animation: false,
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							callbacks: {
								label: (ctx) =>
									`${new Date(ctx.parsed.x!).toLocaleString()}: ${ctx.parsed.y!.toFixed(3)}`
							}
						}
					},
					scales: {
						x: sharedXAxis,
						y: {
							title: { display: true, text: yLabel, color: '#707372' },
							ticks: { color: '#707372' },
							grid: { color: '#E8E9EB' }
						}
					}
				}
			});
		}

		const tChart = makeChart(
			tempChartCanvas,
			'Temperature',
			'#E84A27',
			(r) => r.temperature,
			'Temperature (°C)'
		);

		const dChart = isBar
			? makeChart(
					ptdChartCanvas,
					'Barometric Pressure',
					'#1f7a4f',
					(r) => r.barometricPressure,
					'Barometric Pressure (PSI)'
				)
			: makeChart(ptdChartCanvas, 'Depth', '#1f7a4f', (r) => r.depth, 'Depth (m)');

		return () => {
			tChart.destroy();
			dChart.destroy();
		};
	});

	function addFiles(incoming: FileList | File[]) {
		const next = [...selectedFiles];
		for (const f of incoming) {
			if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
		}
		selectedFiles = next;
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<svelte:head>
	<title>Station Visit — {data.stationVisit.staName ?? 'Unknown'} | IDOT Wetlands Data</title>
</svelte:head>

<!-- Breadcrumb -->
<div class="mb-6">
	<a
		href="/visits/{data.visit.id}"
		class="text-sm font-sans font-semibold text-il-storm hover:text-il-blue transition-colors"
	>
		&larr; Visit #{data.visit.id}
	</a>
</div>

<!-- Page heading -->
<div class="mb-6">
	<h1 class="font-heading font-bold text-3xl text-il-blue">
		{data.stationVisit.staName ?? 'Station Visit'}
	</h1>
	{#if data.stationVisit.code}
		<p class="mt-1 text-sm font-sans font-mono text-il-storm">{data.stationVisit.code}</p>
	{/if}
</div>

<!-- Edit form -->
<div class="border border-il-cloud rounded-lg shadow-sm bg-white overflow-hidden mb-8">
	<div class="px-6 py-4 bg-il-storm-95 border-b border-il-cloud">
		<h2 class="font-heading font-semibold text-base text-il-blue">Edit Station Visit</h2>
	</div>

	<form
		method="POST"
		action="?/updateStationVisit"
		enctype="multipart/form-data"
		use:enhance={(e) => {
			for (const file of selectedFiles) e.formData.append('files', file);
			return ({ update }) =>
				update().then(() => {
					selectedFiles = [];
				});
		}}
		class="px-6 py-5 flex flex-col gap-4"
	>
		<TextField
			id="sv-time"
			name="time"
			label="Time"
			type="time"
			lang="en-GB"
			required
			value={data.stationVisit.time ?? ''}
			inputClass="max-w-xs"
		/>
		<TextField
			id="sv-level"
			name="level"
			label={isGW ? 'Level (m)' : 'Level (ft)'}
			type="number"
			step="any"
			value={activeLevel ?? ''}
			oninput={(e: Event) => (levelEdited = (e.currentTarget as HTMLInputElement).value)}
			inputClass="max-w-xs"
		/>

		<SelectField
			id="sv-status"
			name="statusId"
			label="Status"
			required={statusRequired}
			value={data.stationVisit.statusId ?? ''}
			inputClass="max-w-xs"
		>
			<option value="">— Select status —</option>
			{#each data.statuses as s (s.id)}
				<option value={s.id}>{s.status}</option>
			{/each}
		</SelectField>

		<TextareaField
			id="sv-notes"
			name="notes"
			label="Notes"
			value={data.stationVisit.notes ?? ''}
			inputClass="resize-y max-w-lg"
		/>

		<!-- Files -->
		<div class="flex flex-col gap-2 max-w-lg">
			<span class="text-xs font-semibold font-sans text-il-storm uppercase tracking-wide">
				Data Files
			</span>

			<!-- Drop zone -->
			<div
				role="button"
				tabindex="0"
				onclick={() => fileInput?.click()}
				onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
				ondragover={(e) => {
					e.preventDefault();
					isDragging = true;
				}}
				ondragleave={() => (isDragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					isDragging = false;
					if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
				}}
				class="border-2 border-dashed rounded px-4 py-6 flex flex-col items-center gap-1 cursor-pointer transition-colors
               {isDragging
					? 'border-il-blue bg-il-storm-95'
					: 'border-il-cloud hover:border-il-blue hover:bg-il-storm-95'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-7 h-7 text-il-storm"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
					/>
				</svg>
				<span class="text-sm font-sans text-il-storm">
					Drop files here or <span class="text-il-blue font-semibold">Browse</span>
				</span>
				<span class="text-xs font-sans text-il-storm opacity-60">Multiple files allowed</span>
			</div>

			<input
				bind:this={fileInput}
				type="file"
				multiple
				class="sr-only"
				onchange={(e) => {
					const input = e.currentTarget as HTMLInputElement;
					if (input.files) addFiles(input.files);
					input.value = '';
				}}
			/>

			<!-- Selected file list -->
			{#if selectedFiles.length > 0}
				<ul class="flex flex-col gap-1">
					{#each selectedFiles as file, i (file.name + file.size)}
						<li
							class="flex items-center justify-between text-sm font-sans px-3 py-1.5 rounded bg-il-storm-95 border border-il-cloud"
						>
							<span class="truncate text-il-storm-30 mr-2">{file.name}</span>
							<span class="shrink-0 flex items-center gap-2 text-il-storm text-xs">
								{formatBytes(file.size)}
								<button
									type="button"
									onclick={() => removeFile(i)}
									class="text-il-storm hover:text-red-600 font-bold leading-none"
									aria-label="Remove {file.name}">&times;</button
								>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="flex pt-2">
			<Button type="submit" class="px-5">Save</Button>
		</div>
	</form>
</div>

<!-- Samples section -->
<div class="mb-8">
	<div class="flex items-center justify-between mb-4">
		<h2 class="font-heading font-bold text-xl text-il-blue">Samples</h2>
		<Button onclick={() => (sampleDialogOpen = true)} class="inline-flex items-center gap-2">
			+ Add Sample
		</Button>
	</div>
	{#if data.samples.length === 0}
		<div class="border-2 border-il-cloud rounded p-10 text-center text-il-storm font-sans">
			No samples recorded for this visit.
		</div>
	{:else}
		<div class="border border-il-cloud rounded overflow-hidden shadow-sm">
			<div class="overflow-y-auto max-h-[440px]">
				<table class="w-full text-sm font-sans">
					<TableHeader sticky>
						<tr>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide"
								>Sample Name</th
							>
							<th class="text-left px-4 py-3 font-heading font-semibold tracking-wide">Notes</th>
						</tr>
					</TableHeader>
					<tbody>
						{#each data.samples as sample (sample.id)}
							<tr
								class="border-b border-il-cloud last:border-0 hover:bg-il-storm-95 transition-colors"
							>
								<td class="px-4 py-3 font-semibold text-il-storm-30">
									<a
										href="/visits/{data.visit.id}/station-visits/{data.stationVisit
											.id}/samples/{sample.id}"
										class="hover:underline text-il-blue">{sample.sampleName ?? '—'}</a
									>
								</td>
								<td class="px-4 py-3 text-il-storm">{sample.notes ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<!-- PTD section -->
{#if data.ptdRecords.length > 0}
	<div class="mb-8">
		<div class="flex items-center justify-between mb-4">
			<h2 class="font-heading font-bold text-xl text-il-blue">PTD Measurements</h2>
			<Button onclick={() => (showPtdReview = true)} class="inline-flex items-center gap-2">
				Review PTD
			</Button>
		</div>

		<!-- Summary statistics -->
		<div class="grid gap-4 mb-4 {isBar ? 'grid-cols-2' : 'grid-cols-3'}">
			{#each isBar ? [{ label: 'Temperature', stats: ptdStats.temperature }, { label: 'Barometric Pressure', stats: ptdStats.barometricPressure }] : [{ label: 'Depth', stats: ptdStats.depth }, { label: 'Pressure', stats: ptdStats.pressure }, { label: 'Temperature', stats: ptdStats.temperature }] as col (col.label)}
				<div class="border border-il-cloud rounded p-4 bg-il-storm-95">
					<div class="font-heading font-semibold text-il-blue text-sm mb-2">{col.label}</div>
					<div class="text-xs font-sans text-il-storm space-y-1">
						<div class="flex justify-between">
							<span>Records</span>
							<span class="font-semibold text-il-storm-30">{col.stats?.count ?? '—'}</span>
						</div>
						<div class="flex justify-between">
							<span>Min</span>
							<span class="font-semibold text-il-storm-30"
								>{col.stats ? col.stats.min.toFixed(2) : '—'}</span
							>
						</div>
						<div class="flex justify-between">
							<span>Max</span>
							<span class="font-semibold text-il-storm-30"
								>{col.stats ? col.stats.max.toFixed(2) : '—'}</span
							>
						</div>
						<div class="flex justify-between">
							<span>Mean</span>
							<span class="font-semibold text-il-storm-30"
								>{col.stats ? col.stats.mean.toFixed(2) : '—'}</span
							>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Time-series charts -->
		<div class="flex flex-col gap-4">
			<div class="border border-il-cloud rounded p-3 bg-white">
				<div class="font-heading font-semibold text-il-blue text-sm mb-2">
					Temperature over Time
				</div>
				<div class="h-80"><canvas bind:this={tempChartCanvas}></canvas></div>
			</div>
			<div class="border border-il-cloud rounded p-3 bg-white">
				<div class="font-heading font-semibold text-il-blue text-sm mb-2">
					{isBar ? 'Barometric Pressure over Time' : 'Depth over Time'}
				</div>
				<div class="h-80"><canvas bind:this={ptdChartCanvas}></canvas></div>
			</div>
		</div>
	</div>
{/if}

{#if showPtdReview}
	<div transition:fly={{ y: '100%', duration: 300 }} class="fixed inset-0 z-50">
		<PtdReviewPanel records={data.ptdRecords} {isBar} onclose={() => (showPtdReview = false)} />
	</div>
{/if}

<!-- Sample dialog -->
<AppDialog bind:open={sampleDialogOpen} title="Add Sample">
	<form
		method="POST"
		action="?/addSample"
		use:enhance={closeOnSuccess(() => (sampleDialogOpen = false))}
		class="px-6 py-5 flex flex-col gap-4"
	>
		{#if data.availableBottles.length === 0}
			<p class="text-sm font-sans text-il-storm">
				No unassigned bottles remain for this visit. Allocate more bottles from the visit page.
			</p>
		{:else}
			<SelectField id="sampleId" name="sampleId" label="Bottle" required>
				<option value="">— Select bottle —</option>
				{#each data.availableBottles as b (b.id)}
					<option value={b.id}>{b.sampleName}</option>
				{/each}
			</SelectField>
			<TextareaField id="sampleNotes" name="notes" label="Notes" inputClass="resize-y" />
		{/if}

		<div class="flex items-center justify-between pt-2">
			<Button variant="secondary" onclick={() => (sampleDialogOpen = false)}>Cancel</Button>
			<Button type="submit" class="px-5" disabled={data.availableBottles.length === 0}>Save</Button>
		</div>
	</form>
</AppDialog>
