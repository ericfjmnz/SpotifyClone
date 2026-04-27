// src/vibeMatch.jsx
// Helpers for the Vibe Match playlist creator.
// Uses the ReccoBeats API as a free replacement for Spotify's deprecated
// Audio Features endpoint.

import React from 'react';

// ============================================================
// CONSTANTS
// ============================================================

const RECCO_BASE = 'https://api.reccobeats.com/v1';
const RECCO_BATCH = 40;
const RECCO_DELAY_MS = 250;

export const VIBE_FEATURES = ['danceability', 'energy', 'instrumentalness', 'tempo', 'valence'];

export const VIBE_META = {
    danceability:     { min: 0,  max: 1,   step: 0.01, label: 'Danceability',                fmt: v => v.toFixed(2) },
    energy:           { min: 0,  max: 1,   step: 0.01, label: 'Energy',                      fmt: v => v.toFixed(2) },
    instrumentalness: { min: 0,  max: 1,   step: 0.01, label: 'Instrumentalness',            fmt: v => v.toFixed(2) },
    valence:          { min: 0,  max: 1,   step: 0.01, label: 'Mood (0 = sad → 1 = happy)',  fmt: v => v.toFixed(2) },
    tempo:            { min: 40, max: 220, step: 1,    label: 'Tempo',                       fmt: v => `${Math.round(v)} BPM` },
};

export function defaultVibeRanges() {
    const out = {};
    for (const f of VIBE_FEATURES) out[f] = [VIBE_META[f].min, VIBE_META[f].max];
    return out;
}

// ============================================================
// LANGUAGE DETECTION (heuristic)
// ============================================================

export function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    const lower = text.toLowerCase();

    // Spanish-specific characters → strong signal.
    if (/[ñ¿¡]/.test(text)) return 'spanish';
    if (/[áéíóúü]/.test(lower)) return 'spanish';

    // Spanish-only common words.
    const spanishMarkers = /\b(de|la|el|los|las|que|en|con|por|para|sin|tu|tú|mi|mí|yo|él|ella|esto|esta|estos|estas|este|hace|tiene|tienes|estoy|estás|está|son|somos|fue|ser|estar|amor|corazón|noche|día|vida|sí|hola|gracias|ahora|aquí|allí|porque|pero|aunque|todo|todos|todas|nada|nunca|siempre|también|muy|más|menos|mejor|peor|cuando|donde|quien|cómo)\b/;
    if (spanishMarkers.test(lower)) return 'spanish';

    // English-only common words.
    const englishMarkers = /\b(the|and|you|that|with|for|are|was|were|this|have|from|will|would|could|should|been|their|there|about|what|when|which|who|why|how|all|some|each|every|more|most|less|much|many|other|than|then|just|now|over|under|after|before|because|though|also|only|even|still|never|always|love|night|life|heart|day|don't|won't|can't|isn't|wasn't|i'm|you're|we're|they're|i've|you've|i'll|you'll|gonna|wanna)\b/;
    if (englishMarkers.test(lower)) return 'english';

    return 'unknown';
}

export function trackPassesLanguageFilter(trackText, filter) {
    if (filter === 'any') return true;
    const lang = detectLanguage(trackText);
    if (filter === 'english') return lang !== 'spanish';
    if (filter === 'spanish') return lang !== 'english';
    return true;
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

/**
 * Wraps a Spotify fetch with retry-on-502/503/504. The 502 you saw is a
 * transient gateway error on Spotify's side; one retry usually fixes it.
 *
 * Pass this anywhere the existing `spotifyFetch` was passed.
 */
export function withGatewayRetry(spotifyFetch, { maxRetries = 3, baseDelay = 800 } = {}) {
    return async (path, options = {}) => {
        let attempt = 0;
        while (true) {
            const response = await spotifyFetch(path, options);
            if (response.ok) return response;
            // Retry only on transient gateway errors.
            if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
                const wait = baseDelay * Math.pow(2, attempt); // 800, 1600, 3200
                console.warn(`[VibeMatch] Spotify ${response.status} on ${path}, retry ${attempt + 1}/${maxRetries} after ${wait}ms`);
                await sleep(wait);
                if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                attempt++;
                continue;
            }
            return response; // Non-retryable; let caller handle the bad response.
        }
    };
}

// ============================================================
// AUDIO FEATURES
// ============================================================

/**
 * Get audio features for a list of Spotify track IDs.
 * If a featuresCache is provided (Map), already-cached IDs skip the network.
 */
export async function getAudioFeaturesForSpotifyIds(spotifyIds, signal, onProgress, featuresCache) {
    const result = new Map();
    const toFetch = [];

    if (featuresCache) {
        for (const id of spotifyIds) {
            if (featuresCache.has(id)) result.set(id, featuresCache.get(id));
            else toFetch.push(id);
        }
        console.log(`[VibeMatch] features cache: ${result.size}/${spotifyIds.length} hits, fetching ${toFetch.length}`);
    } else {
        toFetch.push(...spotifyIds);
    }

    if (!toFetch.length) {
        onProgress?.({ done: spotifyIds.length, total: spotifyIds.length });
        return result;
    }

    const batches = chunk(toFetch, RECCO_BATCH);
    let cachedHits = result.size;
    for (let i = 0; i < batches.length; i++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const idsParam = batches[i].join(',');
        let data;
        try {
            data = await reccoFetch(`/audio-features?ids=${idsParam}`, signal);
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            console.warn(`[VibeMatch] features batch ${i + 1} failed: ${e.message}`);
            data = { content: [] };
        }
        const items = Array.isArray(data) ? data : (data.content || []);
        items.forEach((item, idx) => {
            if (!item) return;
            const spId = spotifyIdFromHref(item.href) || batches[i][idx];
            if (spId) {
                result.set(spId, item);
                if (featuresCache) featuresCache.set(spId, item);
            }
        });
        onProgress?.({
            done: cachedHits + Math.min((i + 1) * RECCO_BATCH, toFetch.length),
            total: spotifyIds.length,
        });
        await sleep(RECCO_DELAY_MS);
    }
    console.log(`[VibeMatch] features: ${spotifyIds.length} requested, ${result.size} matched`);
    return result;
}

/**
 * Single recommendation call. Returns ids and a name+artists text per id
 * for downstream language detection.
 */
export async function getReccoRecommendations(seedSpotifyIds, size, signal) {
    if (!seedSpotifyIds.length) return { ids: [], textById: new Map() };
    const seeds = seedSpotifyIds.slice(0, 5);
    const clampedSize = Math.max(1, Math.min(100, size));
    const params = seeds.map(id => `seeds=${encodeURIComponent(id)}`).join('&') + `&size=${clampedSize}`;
    const data = await reccoFetch(`/track/recommendation?${params}`, signal);
    const items = Array.isArray(data) ? data : (data.content || []);

    const ids = [];
    const textById = new Map();
    items.forEach(it => {
        const spId = spotifyIdFromHref(it.href);
        if (!spId) return;
        ids.push(spId);
        const artistsText = (it.artists || []).map(a => a.name).join(' ');
        textById.set(spId, `${it.trackTitle || ''} ${artistsText}`.trim());
    });
    console.log(`[VibeMatch] reco: seeds=${seeds.length} requested=${clampedSize} returned=${items.length} parsed=${ids.length}`);
    return { ids, textById };
}

/**
 * Multiple recommendation calls with rotating seed subsets, merged + deduped.
 * Roughly doubles candidate pool over a single call.
 */
export async function getReccoRecommendationsExpanded(seedSpotifyIds, sizePerCall, signal) {
    const subsets = [];
    if (seedSpotifyIds.length >= 5) {
        subsets.push(seedSpotifyIds.slice(0, 3));
        subsets.push(seedSpotifyIds.slice(2, 5));
    } else if (seedSpotifyIds.length >= 3) {
        subsets.push(seedSpotifyIds.slice(0, 3));
        subsets.push(seedSpotifyIds.slice(-3));
    } else {
        subsets.push(seedSpotifyIds);
    }

    const ids = [];
    const seen = new Set();
    const textById = new Map();
    for (const subset of subsets) {
        const r = await getReccoRecommendations(subset, sizePerCall, signal);
        for (const id of r.ids) {
            if (!seen.has(id)) {
                seen.add(id);
                ids.push(id);
                if (r.textById.has(id)) textById.set(id, r.textById.get(id));
            }
        }
        await sleep(RECCO_DELAY_MS);
    }
    console.log(`[VibeMatch] expanded reco: ${subsets.length} calls → ${ids.length} unique`);
    return { ids, textById };
}

// ============================================================
// FILTERING & RANKING
// ============================================================

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
// SHARED LIBRARY CACHE (used by all creators that scan playlists)
// ============================================================
//
// Top-level cache shape:
//   {
//     library: {
//       populated: boolean,
//       allPlaylists: [...],   // Spotify /me/playlists items, recent-modified first
//       playlistTracks: Map<playlistId, Array<{uri, name, artistsText, artistIds}>>
//     },
//     features: Map<spotifyId, audioFeatures>
//   }
//
// Most helpers below operate on the .library sub-object directly. App.jsx
// owns the top-level cache via useRef, and threads cache.library into
// library helpers and cache.features into feature helpers.

export function createLibraryCache() {
    return {
        library: {
            populated: false,
            allPlaylists: [],
            playlistTracks: new Map(),
        },
        features: new Map(),
    };
}

// Backward-compat alias — old code calling createVibeCache still works.
export const createVibeCache = createLibraryCache;

const isConsolidatedName = (name) =>
    typeof name === 'string' && name.toLowerCase().startsWith('all my playlists songs');

/**
 * Extracts the date label from a consolidated playlist name like
 * "All My Playlists Songs - Part 1 - 11/15/2024" → "11/15/2024"
 */
function extractConsolidatedDate(name) {
    if (!isConsolidatedName(name)) return null;
    const parts = name.split('-').map(s => s.trim());
    return parts[parts.length - 1] || null;
}

/**
 * Populate the shared library cache. Idempotent — safe to call from every
 * creator; only the first call does any network work.
 *
 * `library` is the cache.library sub-object created by createLibraryCache.
 *
 * onProgress({ phase: 'cached'|'listing'|'gathering', ... })
 */
export async function populateLibraryCache(spotifyFetch, signal, onProgress, library) {
    if (library?.populated) {
        const total = library.playlistTracks
            ? [...library.playlistTracks.values()].reduce((s, arr) => s + arr.length, 0)
            : 0;
        console.log(`[LibraryCache] HIT — ${library.allPlaylists.length} playlists, ${total} tracks`);
        onProgress?.({ phase: 'cached', playlists: library.allPlaylists.length, tracks: total });
        return;
    }

    // 1. Walk every playlist (most-recent-modified first).
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

    // 2. For every playlist, page through its tracks and store in the cache.
    const playlistTracks = new Map();
    let processed = 0;
    const concurrency = 5;
    for (let i = 0; i < allPlaylists.length; i += concurrency) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const slice = allPlaylists.slice(i, i + concurrency);
        await Promise.all(slice.map(async (pl) => {
            const tracks = [];
            let tracksUrl = pl.tracks?.href?.replace('https://api.spotify.com/v1', '');
            while (tracksUrl) {
                if (signal?.aborted) return;
                const r = await spotifyFetch(tracksUrl, { signal });
                if (!r.ok) {
                    console.warn(`[LibraryCache] skipping playlist "${pl.name}" (${r.status})`);
                    return;
                }
                const d = await r.json();
                (d.items || []).forEach(it => {
                    const t = it?.track;
                    if (t?.uri?.startsWith('spotify:track:')) {
                        const artistsArr = t.artists || [];
                        tracks.push({
                            uri: t.uri,
                            name: t.name || '',
                            artistsText: artistsArr.map(a => a.name).join(' '),
                            artistIds: artistsArr.map(a => a.id).filter(Boolean),
                        });
                    }
                });
                tracksUrl = d.next ? d.next.replace('https://api.spotify.com/v1', '') : null;
            }
            playlistTracks.set(pl.id, tracks);
        }));
        processed += slice.length;
        onProgress?.({ phase: 'gathering', processed, total: allPlaylists.length });
    }

    library.allPlaylists = allPlaylists;
    library.playlistTracks = playlistTracks;
    library.populated = true;
    const totalTracks = [...playlistTracks.values()].reduce((s, arr) => s + arr.length, 0);
    console.log(`[LibraryCache] POPULATED — ${allPlaylists.length} playlists, ${totalTracks} tracks`);
}

/**
 * Read a subset of cached tracks based on the calling creator's needs.
 *
 * `library` is the cache.library sub-object.
 *
 * Options:
 *   excludeConsolidated:        skip playlists named "All My Playlists Songs ..."
 *   onlyMostRecentConsolidated: only the most recent "All My Playlists Songs" set
 *                               (returns extra metadata: { mostRecentDate, daysOld })
 *   consolidatedAndNewer:       most-recent consolidated set + every playlist
 *                               modified after it (Vibe Match Mode A behavior)
 *
 * Returns:
 *   {
 *     trackUris:        string[] — unique URIs in selection order
 *     trackInfo:        Map<uri, {name, artistsText, artistIds, sourcePlaylistIds}>
 *     uniqueArtistIds:  string[]
 *     sourcePlaylists:  same shape as library.allPlaylists
 *     mostRecentDate?:  string (only when onlyMostRecentConsolidated)
 *     daysOld?:         number (only when onlyMostRecentConsolidated)
 *   }
 */
export function selectTracksFromCache(library, options = {}) {
    if (!library?.populated) {
        throw new Error('selectTracksFromCache: cache not populated; call populateLibraryCache first');
    }

    const { excludeConsolidated, onlyMostRecentConsolidated, consolidatedAndNewer } = options;
    let sourcePlaylists = [];
    let mostRecentDate = null;
    let daysOld = null;

    if (onlyMostRecentConsolidated) {
        const consolidated = library.allPlaylists.filter(p => isConsolidatedName(p.name));
        if (!consolidated.length) {
            return { trackUris: [], trackInfo: new Map(), uniqueArtistIds: [], sourcePlaylists: [], mostRecentDate: null, daysOld: null };
        }
        let latestTs = 0;
        consolidated.forEach(p => {
            const dateStr = extractConsolidatedDate(p.name);
            if (!dateStr) return;
            const ts = new Date(dateStr).getTime();
            if (!isNaN(ts) && ts > latestTs) {
                latestTs = ts;
                mostRecentDate = dateStr;
            }
        });
        if (mostRecentDate) {
            sourcePlaylists = consolidated.filter(p => p.name.includes(mostRecentDate));
            daysOld = (Date.now() - latestTs) / (1000 * 60 * 60 * 24);
        } else {
            sourcePlaylists = consolidated;
        }
    } else if (consolidatedAndNewer) {
        const all = library.allPlaylists;
        const firstConsolidatedIdx = all.findIndex(p => isConsolidatedName(p.name));
        if (firstConsolidatedIdx === -1) {
            sourcePlaylists = all;
        } else {
            const newer = all.slice(0, firstConsolidatedIdx).filter(p => !isConsolidatedName(p.name));
            const sameDate = extractConsolidatedDate(all[firstConsolidatedIdx].name);
            const sameSet = all.filter(p => isConsolidatedName(p.name) && (sameDate ? p.name.includes(sameDate) : p.id === all[firstConsolidatedIdx].id));
            sourcePlaylists = [...newer, ...sameSet];
        }
    } else if (excludeConsolidated) {
        sourcePlaylists = library.allPlaylists.filter(p => !isConsolidatedName(p.name));
    } else {
        sourcePlaylists = library.allPlaylists;
    }

    const trackInfo = new Map();
    const uniqueArtistIds = new Set();
    const trackUris = [];
    for (const pl of sourcePlaylists) {
        const tracks = library.playlistTracks.get(pl.id) || [];
        for (const t of tracks) {
            t.artistIds.forEach(id => uniqueArtistIds.add(id));
            const existing = trackInfo.get(t.uri);
            if (existing) {
                existing.sourcePlaylistIds.push(pl.id);
            } else {
                trackInfo.set(t.uri, {
                    name: t.name,
                    artistsText: t.artistsText,
                    artistIds: t.artistIds,
                    sourcePlaylistIds: [pl.id],
                });
                trackUris.push(t.uri);
            }
        }
    }

    return {
        trackUris,
        trackInfo,
        uniqueArtistIds: Array.from(uniqueArtistIds),
        sourcePlaylists,
        mostRecentDate,
        daysOld,
    };
}

/**
 * Add a freshly-created playlist + its tracks to the cache so subsequent
 * reads see them. Call this after a creator successfully adds tracks.
 *
 *   library:      the cache.library sub-object
 *   playlistMeta: the Spotify response object from POST /users/{id}/playlists
 *   tracks:       Array<{uri, name?, artistsText?, artistIds?}>
 */
export function addPlaylistToCache(library, playlistMeta, tracks) {
    if (!library?.populated) return; // Cache not yet built; nothing to extend.
    if (!playlistMeta?.id) return;

    if (!library.allPlaylists.find(p => p.id === playlistMeta.id)) {
        library.allPlaylists.unshift(playlistMeta); // Insert at front (most-recently-modified).
    }
    const normalized = (tracks || []).map(t => ({
        uri: t.uri,
        name: t.name || '',
        artistsText: t.artistsText || '',
        artistIds: Array.isArray(t.artistIds) ? t.artistIds : [],
    }));
    library.playlistTracks.set(playlistMeta.id, normalized);
    console.log(`[LibraryCache] extended with playlist "${playlistMeta.name}" (${normalized.length} tracks)`);
}

// ============================================================
// LEGACY: fetchVibeSourceTracks (kept as a thin wrapper for back-compat)
// ============================================================

/**
 * Vibe Match Mode A's source-track gatherer. Delegates to the shared cache
 * and selects the consolidatedAndNewer subset.
 *
 * `libraryCache` is the cache.library sub-object.
 */
export async function fetchVibeSourceTracks(spotifyFetch, signal, onProgress, libraryCache) {
    await populateLibraryCache(spotifyFetch, signal, onProgress, libraryCache);
    const sel = selectTracksFromCache(libraryCache, { consolidatedAndNewer: true });

    // Add a `searchText` convenience field on each trackInfo entry so existing
    // callers (Vibe Match handler) can do language detection without rebuilding it.
    const trackInfoWithSearch = new Map();
    for (const [uri, info] of sel.trackInfo) {
        trackInfoWithSearch.set(uri, {
            ...info,
            searchText: `${info.name || ''} ${info.artistsText || ''}`.trim(),
        });
    }

    return {
        sourcePlaylists: sel.sourcePlaylists,
        trackUris: sel.trackUris,
        trackInfo: trackInfoWithSearch,
        excludeUris: new Set(sel.trackUris),
        fromCache: false, // populateLibraryCache logs its own hit/miss
    };
}

// ============================================================
// REACT COMPONENT: Dual-handle range slider
// ============================================================

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
