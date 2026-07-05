<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { get } from 'svelte/store';
	import Button from '$lib/components/Button.svelte';

	type PtdRecord = {
		id: number;
		timestamp: Date | null;
		pressure: number | null;
		temperature: number | null;
		depth: number | null;
		barometricPressure: number | null;
		includeInReport: boolean;
	};

	let {
		records,
		isBar = false,
		onclose
	}: { records: PtdRecord[]; isBar?: boolean; onclose: () => void } = $props();

	// One-time initialization from DB state — untrack signals this is intentional
	let excludedIds = $state<Set<number>>(
		new Set(untrack(() => records.filter((r) => !r.includeInReport).map((r) => r.id)))
	);

	let filterStart = $state('');
	let filterEnd = $state('');
	let maxTemp = $state<number | ''>('');
	let maxDepth = $state<number | ''>('');

	let filteredRecords = $derived.by(() => {
		return records.filter((r) => {
			if (filterStart && r.timestamp && new Date(r.timestamp) < new Date(filterStart)) return false;
			if (filterEnd && r.timestamp && new Date(r.timestamp) > new Date(filterEnd)) return false;
			if (Number.isFinite(maxTemp) && r.temperature != null && r.temperature >= (maxTemp as number))
				return false;
			if (Number.isFinite(maxDepth) && r.depth != null && r.depth >= (maxDepth as number))
				return false;
			return true;
		});
	});

	let includedCount = $derived(records.length - excludedIds.size);

	let nowExcluded = $derived([...excludedIds]);
	let nowIncluded = $derived(
		records.filter((r) => !r.includeInReport && !excludedIds.has(r.id)).map((r) => r.id)
	);

	let scrollEl = $state<HTMLDivElement | undefined>(undefined);

	// Initialize with count 0 to avoid referencing $derived outside reactive context
	const virtualizer = createVirtualizer({
		count: 0,
		getScrollElement: () => scrollEl ?? null,
		estimateSize: () => 40,
		overscan: 10
	});

	$effect(() => {
		// get() reads the store value without subscribing, preventing infinite loops
		get(virtualizer).setOptions({
			count: filteredRecords.length,
			getScrollElement: () => scrollEl ?? null,
			estimateSize: () => 40,
			overscan: 10
		});
	});

	function excludeMatching() {
		const next = new Set(excludedIds);
		for (const r of filteredRecords) next.add(r.id);
		excludedIds = next;
	}

	function includeMatching() {
		const next = new Set(excludedIds);
		for (const r of filteredRecords) next.delete(r.id);
		excludedIds = next;
	}

	function fmt(v: number | null, decimals = 3) {
		return v != null ? v.toFixed(decimals) : '—';
	}

	function fmtTime(ts: Date | null) {
		if (!ts) return '—';
		return new Date(ts).toLocaleString();
	}
</script>

<div class="fixed inset-0 z-50 bg-white flex flex-col">
	<!-- Header -->
	<div
		class="flex items-center justify-between px-6 py-4 border-b border-il-cloud bg-il-storm-95 shrink-0"
	>
		<h2 class="font-heading font-bold text-xl text-il-blue">Review PTD Measurements</h2>
		<button
			type="button"
			onclick={onclose}
			class="text-il-storm hover:text-il-blue text-2xl leading-none font-sans"
			aria-label="Close">&times;</button
		>
	</div>

	<!-- Filter bar -->
	<div class="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-il-cloud bg-white shrink-0">
		<div class="flex flex-col gap-1">
			<label
				for="ptd-filter-start"
				class="text-xs font-semibold font-sans text-il-storm uppercase tracking-wide"
			>
				Start Time
			</label>
			<input
				id="ptd-filter-start"
				type="datetime-local"
				bind:value={filterStart}
				class="border border-il-cloud rounded px-2 py-1 text-sm font-sans text-il-storm-30 bg-white focus:outline-none focus:ring-2 focus:ring-il-blue"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label
				for="ptd-filter-end"
				class="text-xs font-semibold font-sans text-il-storm uppercase tracking-wide"
			>
				End Time
			</label>
			<input
				id="ptd-filter-end"
				type="datetime-local"
				bind:value={filterEnd}
				class="border border-il-cloud rounded px-2 py-1 text-sm font-sans text-il-storm-30 bg-white focus:outline-none focus:ring-2 focus:ring-il-blue"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label
				for="ptd-filter-temp"
				class="text-xs font-semibold font-sans text-il-storm uppercase tracking-wide"
			>
				Max Temp (°C)
			</label>
			<input
				id="ptd-filter-temp"
				type="number"
				step="any"
				placeholder="e.g. 0"
				bind:value={maxTemp}
				class="border border-il-cloud rounded px-2 py-1 text-sm font-sans text-il-storm-30 bg-white focus:outline-none focus:ring-2 focus:ring-il-blue w-32"
			/>
		</div>
		{#if !isBar}
			<div class="flex flex-col gap-1">
				<label
					for="ptd-filter-depth"
					class="text-xs font-semibold font-sans text-il-storm uppercase tracking-wide"
				>
					Max Depth (m)
				</label>
				<input
					id="ptd-filter-depth"
					type="number"
					step="any"
					placeholder="e.g. 0"
					bind:value={maxDepth}
					class="border border-il-cloud rounded px-2 py-1 text-sm font-sans text-il-storm-30 bg-white focus:outline-none focus:ring-2 focus:ring-il-blue w-32"
				/>
			</div>
		{/if}
		<div class="flex items-end gap-2 pb-0.5">
			<button
				type="button"
				onclick={excludeMatching}
				class="bg-il-storm hover:opacity-80 text-white font-sans font-semibold text-sm px-3 py-1.5 rounded transition-opacity"
			>
				Exclude matching
			</button>
			<button
				type="button"
				onclick={includeMatching}
				class="border border-il-storm text-il-storm hover:bg-il-storm-95 font-sans font-semibold text-sm px-3 py-1.5 rounded transition-colors"
			>
				Include matching
			</button>
		</div>
		<span class="ml-auto text-xs font-sans text-il-storm self-end pb-1">
			{filteredRecords.length} of {records.length} rows shown
		</span>
	</div>

	<!-- Table header -->
	<div
		class="grid {isBar
			? 'grid-cols-[40px_1fr_1fr_1fr]'
			: 'grid-cols-[40px_1fr_1fr_1fr_1fr]'} bg-il-blue text-white text-xs font-heading font-semibold tracking-wide shrink-0"
	>
		<div class="px-3 py-2 flex items-center justify-center">
			<span class="sr-only">Include</span>
		</div>
		<div class="px-3 py-2">Time</div>
		{#if isBar}
			<div class="px-3 py-2">Barometric Pressure (PSI)</div>
			<div class="px-3 py-2">Temperature (°C)</div>
		{:else}
			<div class="px-3 py-2">Pressure</div>
			<div class="px-3 py-2">Temperature (°C)</div>
			<div class="px-3 py-2">Depth (m)</div>
		{/if}
	</div>

	<!-- Virtualized body -->
	<div bind:this={scrollEl} class="flex-1 overflow-y-auto">
		<div style:height="{$virtualizer.getTotalSize()}px" class="relative w-full">
			{#each $virtualizer.getVirtualItems() as vRow (vRow.index)}
				{@const row = filteredRecords[vRow.index]}
				{#if row}
					<div
						style:position="absolute"
						style:top="{vRow.start}px"
						style:height="{vRow.size}px"
						style:width="100%"
						class="grid {isBar
							? 'grid-cols-[40px_1fr_1fr_1fr]'
							: 'grid-cols-[40px_1fr_1fr_1fr_1fr]'} border-b border-il-cloud items-center
						{excludedIds.has(row.id)
							? 'opacity-50 bg-il-storm-95'
							: vRow.index % 2 === 0
								? 'bg-white'
								: 'bg-il-storm-95/40'}"
					>
						<div class="flex items-center justify-center h-full">
							<input
								type="checkbox"
								checked={!excludedIds.has(row.id)}
								onchange={() => {
									const next = new Set(excludedIds);
									if (next.has(row.id)) next.delete(row.id);
									else next.add(row.id);
									excludedIds = next;
								}}
								aria-label="Include row {row.id} in report"
								class="w-4 h-4 accent-il-blue cursor-pointer"
							/>
						</div>
						<div
							class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
								? 'line-through'
								: ''}"
						>
							{fmtTime(row.timestamp)}
						</div>
						{#if isBar}
							<div
								class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
									? 'line-through'
									: ''}"
							>
								{fmt(row.barometricPressure)}
							</div>
							<div
								class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
									? 'line-through'
									: ''}"
							>
								{fmt(row.temperature)}
							</div>
						{:else}
							<div
								class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
									? 'line-through'
									: ''}"
							>
								{fmt(row.pressure)}
							</div>
							<div
								class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
									? 'line-through'
									: ''}"
							>
								{fmt(row.temperature)}
							</div>
							<div
								class="px-3 text-sm font-sans text-il-storm-30 {excludedIds.has(row.id)
									? 'line-through'
									: ''}"
							>
								{fmt(row.depth)}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Footer -->
	<div
		class="flex items-center justify-between px-6 py-4 border-t border-il-cloud bg-il-storm-95 shrink-0"
	>
		<p class="text-sm font-sans text-il-storm">
			<span class="font-semibold text-il-storm-30">{includedCount}</span> of
			<span class="font-semibold text-il-storm-30">{records.length}</span> rows will be included in the
			report
		</p>
		<div class="flex items-center gap-3">
			<Button variant="secondary" onclick={onclose}>Cancel</Button>
			<form
				method="POST"
				action="?/updatePtdExclusions"
				use:enhance={() => {
					return ({ update }) =>
						update({ invalidateAll: false }).then(async () => {
							await invalidateAll();
							onclose();
						});
				}}
			>
				<input type="hidden" name="excludedIds" value={JSON.stringify(nowExcluded)} />
				<input type="hidden" name="includedIds" value={JSON.stringify(nowIncluded)} />
				<Button type="submit" class="px-5">Save</Button>
			</form>
		</div>
	</div>
</div>
