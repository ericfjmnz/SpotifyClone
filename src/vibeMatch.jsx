// src/vibeMatch.js
// Helpers for the Vibe Match playlist creator.
// Uses the ReccoBeats API as a free, drop-in replacement for Spotify's
// deprecated Audio Features endpoint.

import React from 'react';

// ============================================================
// CONSTANTS
// ============================================================

const RECCO_BASE = 'https://api.reccobeats.com/v1';

// Per-batch sizes. ReccoBeats doesn't publish a hard limit but starts
// returning 429s if you push too hard; ~40 IDs/batch with a small delay
// between batches has been reliable for users in the wild.
const RECCO_BATCH = 40;
const RECCO_DELAY_MS = 250;

export const VIBE_FEATURES = ['danceability', 'energy', 'instrumentalness', 'tempo', 'valence'];

// Per-feature metadata: absolute range, slider step, label, and a formatter
// for how to display values in the UI.
export const VIBE_META = {
    danceability:     { min: 0,  max: 1,   step: 0.01, label: 'Danceability',     fmt: v => v.toFixed(2) },
    energy:           { min: 0,  max: 1,   step: 0.01, label: 'Energy',           fmt: v => v.toFixed(2) },
    instrumentalness: { min: 0,  max: 1,   step: 0.01, label: 'Instrumentalness', fmt: v => v.toFixed(2) },
    valence:          { min: 0,  max: 1,   step: 0.01, label: 'Valence (Mood)',   fmt: v => v.toFixed(2) },
    tempo:            { min: 40, max: 220, step: 1,    label: 'Tempo',            fmt: v => `${Math.round(v)} BPM` },
};

// Default range = full span. Users widen/narrow from here.
export function defaultVibeRanges() {
    const out = {};
    for (const f of VIBE_FEATURES) out[f] = [VIBE_META[f].min, VIBE_META[f].max];
    return out;
}

// ============================================================
// LOW-LEVEL FETCH HELPERS
// ============================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Extract the Spotify track ID from a ReccoBeats `href` field, which looks
// like "https://open.spotify.com/track/<id>".
function spotifyIdFromHref(href) {
    if (typeof href !== 'string') return null;
    const m = href.match(/\/track\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
}

async function reccoFetch(path, signal) {
    let attempt = 0;
    while (attempt < 4) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await fetch(`${RECCO_BASE}${path}`, { signal });
        if (response.status === 429) {
            const wait = parseInt(response.headers.get('Retry-After') || '2', 10) * 1000;
            console.warn(`ReccoBeats 429, waiting ${wait}ms`);
            await sleep(wait);
            attempt++;
            continue;
        }
        if (!response.ok) throw new Error(`ReccoBeats ${response.status} on ${path}`);
        return response.json();
    }
    throw new Error('ReccoBeats: too many retries');
}

// ============================================================
// PUBLIC API: AUDIO FEATURES
// ============================================================

/**
 * Get audio features for a list of Spotify track IDs.
 * Returns Map<spotifyId, featuresObject>. Tracks not in ReccoBeats' DB
 * are silently skipped (typical miss rate: 5-15% on consumer libraries).
 *
 * onProgress({ done, total }) is called after each batch.
 */
export async function getAudioFeaturesForSpotifyIds(spotifyIds, signal, onProgress) {
    const result = new Map();
    if (!spotifyIds.length) return result;

    const batches = chunk(spotifyIds, RECCO_BATCH);
    for (let i = 0; i < batches.length; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        // ReccoBeats' /v1/audio-features accepts Spotify IDs directly.
        const idsParam = batches[i].join(',');
        let data;
        try {
            data = await reccoFetch(`/audio-features?ids=${idsParam}`, signal);
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.warn(`Skipping batch ${i + 1}: ${e.message}`);
            data = { content: [] };
        }

        const items = Array.isArray(data) ? data : (data.content || []);
        items.forEach((item, idx) => {
            if (!item) return;
            // Prefer href-based ID matching (reliable). Fall back to positional
            // matching against the request order if href is missing.
            const spId = spotifyIdFromHref(item.href) || batches[i][idx];
            if (spId) result.set(spId, item);
        });

        onProgress?.({ done: Math.min((i + 1) * RECCO_BATCH, spotifyIds.length), total: spotifyIds.length });
        await sleep(RECCO_DELAY_MS);
    }
    return result;
}

/**
 * Get up to `size` recommended Spotify track IDs given seed Spotify IDs.
 * ReccoBeats accepts up to 5 seeds (matching Spotify's old contract).
 */
export async function getReccoRecommendations(seedSpotifyIds, size, signal) {
    if (!seedSpotifyIds.length) return [];
    const seeds = seedSpotifyIds.slice(0, 5);
    const params = seeds.map(id => `seeds=${encodeURIComponent(id)}`).join('&') + `&size=${size}`;
    const data = await reccoFetch(`/track/recommendation?${params}`, signal);
    const items = Array.isArray(data) ? data : (data.content || []);
    // Each item should have an href back to Spotify.
    return items.map(it => spotifyIdFromHref(it.href)).filter(Boolean);
}

// ============================================================
// FILTERING & RANKING
// ============================================================

/** Returns true if all 5 features fall inside the user's selected ranges. */
export function trackMatchesVibe(features, ranges) {
    if (!features) return false;
    for (const f of VIBE_FEATURES) {
        const v = features[f];
        if (typeof v !== 'number') return false;
        const [lo, hi] = ranges[f];
        if (v < lo || v > hi) return false;
    }
    return true;
}

/** Smaller = closer to center of the user's selected ranges. Used for ranking. */
export function distanceFromCenter(features, ranges) {
    let sum = 0;
    for (const f of VIBE_FEATURES) {
        const [lo, hi] = ranges[f];
        const mid = (lo + hi) / 2;
        const span = VIBE_META[f].max - VIBE_META[f].min;
        const norm = (features[f] - mid) / span;
        sum += norm * norm;
    }
    return Math.sqrt(sum);
}

// ============================================================
// PLAYLIST SOURCE: most recent consolidated playlist + newer playlists
// ============================================================

/**
 * Identifies the "vibe pool" for Mode A:
 *   - The most recent "All My Playlists Songs" set (any Parts from the same date).
 *   - Plus every playlist that was modified more recently than that set.
 *
 * Spotify's /me/playlists is ordered most-recently-modified first, so we walk
 * the list top-to-bottom: everything before the consolidated set is "newer".
 *
 * Returns { sourcePlaylists: [...], excludeUris: Set<string> } where
 * excludeUris is for Mode B's "songs not already in my library" filter.
 */
export async function fetchVibeSourceTracks(spotifyFetch, signal, onProgress) {
    // 1. Page through ALL the user's playlists (most-recent-modified first).
    const allPlaylists = [];
    let nextUrl = '/me/playlists?limit=50';
    while (nextUrl) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await spotifyFetch(nextUrl, { signal });
        if (!response.ok) throw new Error(`Failed to fetch playlists: ${response.status}`);
        const data = await response.json();
        allPlaylists.push(...(data.items || []).filter(Boolean));
        nextUrl = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
        onProgress?.({ phase: 'listing', count: allPlaylists.length });
        await sleep(50);
    }

    // 2. Find the most recent consolidated set. Names look like:
    //    "All My Playlists Songs - Part 1 - 11/15/2024"
    // The first one we see in the list (top-most = most recent) wins.
    const isConsolidated = (p) => p.name && p.name.toLowerCase().startsWith('all my playlists songs');
    const consolidatedIdx = allPlaylists.findIndex(isConsolidated);

    // 3. Build the source list:
    //    - If consolidated set exists: everything before it (newer) + every Part of the most recent date.
    //    - Else: every playlist (consolidation never run).
    let sourcePlaylists;
    if (consolidatedIdx === -1) {
        sourcePlaylists = allPlaylists;
    } else {
        // Extract the date label of the most recent consolidated playlist.
        // Names are " - Part X - <dateString>"; strip everything before the date.
        const mostRecentName = allPlaylists[consolidatedIdx].name;
        const datePart = mostRecentName.split(' - ').slice(2).join(' - ').trim() || null;

        const newer = allPlaylists.slice(0, consolidatedIdx).filter(p => !isConsolidated(p));
        const sameConsolidationParts = allPlaylists.filter(p =>
            isConsolidated(p) && (datePart ? p.name.includes(datePart) : p.id === allPlaylists[consolidatedIdx].id)
        );
        sourcePlaylists = [...newer, ...sameConsolidationParts];
    }

    // 4. Pull all unique track URIs from the source playlists.
    const trackUris = new Set();
    let processed = 0;
    const concurrency = 5;
    for (let i = 0; i < sourcePlaylists.length; i += concurrency) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const slice = sourcePlaylists.slice(i, i + concurrency);
        await Promise.all(slice.map(async (pl) => {
            let tracksUrl = pl.tracks?.href?.replace('https://api.spotify.com/v1', '');
            while (tracksUrl) {
                if (signal?.aborted) return;
                const r = await spotifyFetch(tracksUrl, { signal });
                if (!r.ok) {
                    console.warn(`Skipping playlist "${pl.name}" (${r.status})`);
                    return;
                }
                const d = await r.json();
                (d.items || []).forEach(it => {
                    if (it?.track?.uri?.startsWith('spotify:track:')) trackUris.add(it.track.uri);
                });
                tracksUrl = d.next ? d.next.replace('https://api.spotify.com/v1', '') : null;
            }
        }));
        processed += slice.length;
        onProgress?.({ phase: 'gathering', processed, total: sourcePlaylists.length });
    }

    return {
        sourcePlaylists,
        trackUris: Array.from(trackUris),
        // Useful for Mode B (deduping against everything in the user's library).
        excludeUris: trackUris,
    };
}

// ============================================================
// REACT COMPONENT: Dual-handle range slider
// ============================================================

/**
 * Two stacked native range inputs styled to look like a single dual-handle slider.
 * Handles overlap/snap correctly so the min thumb can never cross the max thumb.
 *
 * Props:
 *   meta: { min, max, step, label, fmt }
 *   value: [low, high]
 *   onChange: ([low, high]) => void
 *   disabled: boolean
 */
export function RangeSlider({ meta, value, onChange, disabled }) {
    const [lo, hi] = value;
    const minPct = ((lo - meta.min) / (meta.max - meta.min)) * 100;
    const maxPct = ((hi - meta.min) / (meta.max - meta.min)) * 100;

    const handleLowChange = (e) => {
        const v = Math.min(parseFloat(e.target.value), hi - meta.step);
        onChange([v, hi]);
    };
    const handleHighChange = (e) => {
        const v = Math.max(parseFloat(e.target.value), lo + meta.step);
        onChange([lo, v]);
    };

    // Tailwind arbitrary variants style the native thumb. The track and fill
    // are rendered as separate divs underneath; the inputs themselves are
    // transparent except for their thumbs, with pointer-events scoped to
    // thumbs only so both handles remain draggable.
    const thumbClasses =
        '[&::-webkit-slider-thumb]:appearance-none ' +
        '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 ' +
        '[&::-webkit-slider-thumb]:rounded-full ' +
        '[&::-webkit-slider-thumb]:bg-purple-400 ' +
        '[&::-webkit-slider-thumb]:cursor-pointer ' +
        '[&::-webkit-slider-thumb]:pointer-events-auto ' +
        '[&::-webkit-slider-thumb]:border-0 ' +
        '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 ' +
        '[&::-moz-range-thumb]:rounded-full ' +
        '[&::-moz-range-thumb]:bg-purple-400 ' +
        '[&::-moz-range-thumb]:cursor-pointer ' +
        '[&::-moz-range-thumb]:border-0';

    return (
        <div className="mb-4">
            <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">{meta.label}</span>
                <span className="text-sm text-gray-400 tabular-nums">
                    {meta.fmt(lo)} – {meta.fmt(hi)}
                </span>
            </div>
            <div className="relative h-8 flex items-center">
                <div className="absolute left-0 right-0 h-1 bg-gray-700 rounded" />
                <div
                    className="absolute h-1 bg-purple-500 rounded"
                    style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
                />
                <input
                    type="range"
                    min={meta.min} max={meta.max} step={meta.step}
                    value={lo}
                    onChange={handleLowChange}
                    disabled={disabled}
                    className={`absolute w-full h-8 appearance-none bg-transparent z-10 pointer-events-none ${thumbClasses}`}
                />
                <input
                    type="range"
                    min={meta.min} max={meta.max} step={meta.step}
                    value={hi}
                    onChange={handleHighChange}
                    disabled={disabled}
                    className={`absolute w-full h-8 appearance-none bg-transparent z-10 pointer-events-none ${thumbClasses}`}
                />
            </div>
        </div>
    );
}
