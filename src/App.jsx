import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

// --- Spotify API Configuration ---
const REDIRECT_URI = window.location.origin;
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "playlist-modify-public",
    "playlist-modify-private",
    "playlist-read-private",
    "user-top-read",
    "user-read-recently-played",
    "playlist-read-collaborative",
    "user-read-currently-playing",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state"
].join(" ");

const AppContext = createContext();

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function LoginScreen() {
    const [clientId, setClientId] = useState("");
    const [loginError, setLoginError] = useState("");
    
    useEffect(() => {
        const storedClientId = window.localStorage.getItem("spotify_client_id");
        if (storedClientId) {
            setClientId(storedClientId);
        }

        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
            setLoginError(`Spotify returned an error: "${error}". Please ensure your Redirect URI is correctly set in your Spotify Developer Dashboard.`);
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (clientId) {
            setLoginError("");
            window.localStorage.setItem("spotify_client_id", clientId);

            const verifier = generateCodeVerifier(128);
            window.localStorage.setItem("code_verifier", verifier);
            const challenge = await generateCodeChallenge(verifier);

            const params = new URLSearchParams();
            params.append("client_id", clientId);
            params.append("response_type", "code");
            params.append("redirect_uri", REDIRECT_URI);
            params.append("scope", SCOPES);
            params.append("code_challenge_method", "S256");
            params.append("code_challenge", challenge);

            document.location = `${AUTH_ENDPOINT}?${params.toString()}`;
        } else {
            setLoginError("Please enter a valid Spotify Client ID.");
        }
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white p-4">
            <div className="text-center bg-gray-800 p-8 rounded-lg shadow-2xl max-w-2xl w-full">
                <h1 className="text-4xl font-bold mb-2">Connect to Spotify</h1>
                <p className="text-gray-400 mb-6">Please send your Spotify email to efjmnz@hotmail.com and I will send you the Client ID.</p>
                
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <input
                        type="text"
                        placeholder="Enter your Spotify Client ID"
                        value={clientId}
                        onChange={(e) => {
                            setClientId(e.target.value);
                            setLoginError("");
                        }}
                        className="p-3 bg-gray-700 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {loginError && <p className="text-red-400 text-sm bg-red-900 bg-opacity-30 p-3 rounded-md">{loginError}</p>}
                    <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 transform hover:scale-105">
                        Login with Spotify
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function App() {
    const [token, setToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('home');
    const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
    const [player, setPlayer] = useState(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [deviceId, setDeviceId] = useState(null);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPaused, setIsPaused] = useState(true);
    const [position, setPosition] = useState(0);
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const [libraryVersion, setLibraryVersion] = useState(0);
    const [profile, setProfile] = useState(null);
    const [playlistToEdit, setPlaylistToEdit] = useState(null);
    const [playlistToDelete, setPlaylistToDelete] = useState(null);

    const [creatorStatus, setCreatorStatus] = useState('');
    const [creatorError, setCreatorError] = useState('');
    const [createdPlaylist, setCreatedPlaylist] = useState(null);
    const [showCreatorStatus, setShowCreatorStatus] = useState(false);
    const [fadeCreatorStatusOut, setFadeCreatorStatusOut] = useState(false);

    const [isWqxrLoading, setIsWqxrLoading] = useState(false);
    const [wqxrProgress, setWqxrProgress] = useState(0);
    const [wqxrAbortController, setWqxrAbortController] = useState(null);

    const [isCustomLoading, setIsCustomLoading] = useState(false);
    const [customPlaylistName, setCustomPlaylistName] = useState('');
    const [aiPrompt, setAiPrompt] = useState("");
    const [customAbortController, setCustomAbortController] = useState(null);

    const [isTopTracksLoading, setIsTopTracksLoading] = useState(false);
    const [topTracksProgress, setTopTracksProgress] = useState(0);
    const [topTracksAbortController, setTopTracksAbortController] = useState(null);
    const [topTracksTimeRange, setTopTracksTimeRange] = useState(null);

    // --- CONSOLIDATION STATES ---
    const [isConsolidateLoading, setIsConsolidateLoading] = useState(false);
    const [consolidateProgress, setConsolidateProgress] = useState(0);
    const [consolidateAbortController, setConsolidateAbortController] = useState(null);
    const [consolidatePhase, setConsolidatePhase] = useState('');
    const [consolidatePlaylistsFound, setConsolidatePlaylistsFound] = useState(0);
    const [consolidatePlaylistsProcessed, setConsolidatePlaylistsProcessed] = useState(0);
    const [consolidateTotalToProcess, setConsolidateTotalToProcess] = useState(0);
    const [consolidateTracksAdded, setConsolidateTracksAdded] = useState(0);

    // --- CATEGORY MIX STATES ---
    const [isCategoryScanLoading, setIsCategoryScanLoading] = useState(false);
    const [categoryScanProgress, setCategoryScanProgress] = useState(0);
    const [categoryScanPhase, setCategoryScanPhase] = useState('');
    const [categoryScanAbortController, setCategoryScanAbortController] = useState(null);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [categoryMixName, setCategoryMixName] = useState("");
    const [categoryFilterData, setCategoryFilterData] = useState(null);
    const [categoryScanPlaylistsTotal, setCategoryScanPlaylistsTotal] = useState(0);
    const [categoryScanPlaylistsProcessed, setCategoryScanPlaylistsProcessed] = useState(0);
    const [categoryScanArtistsTotal, setCategoryScanArtistsTotal] = useState(0);
    const [categoryScanArtistsProcessed, setCategoryScanArtistsProcessed] = useState(0);
    const [categoryScanTracksAdded, setCategoryScanTracksAdded] = useState(0);
    const [categoryScanTracksTotal, setCategoryScanTracksTotal] = useState(0);

    const [isGenreFusionLoading, setIsGenreFusionLoading] = useState(false);
    const [genreFusionProgress, setGenreFusionProgress] = useState(0);
    const [genreFusionAbortController, setGenreFusionAbortController] = useState(null);
    const [availableGenres, setAvailableGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);
    const [genreFusionName, setGenreFusionName] = useState("");

    const logout = useCallback(() => {
        setToken(null);
        if(player) player.disconnect();
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("spotify_client_id");
        window.localStorage.removeItem("code_verifier");
        
        // Remove replaceState logic as it errors in Canvas iframe
        // window.history.replaceState(null, null, window.location.pathname);
        
        setView('home');
        setSelectedPlaylistId(null);
    }, [player]);
    
    const spotifyFetch = useCallback(async (endpoint, options = {}) => {
        const maxRetries = 3;
        let retryCount = 0;
        let currentDelay = 100;

        while (retryCount <= maxRetries) {
            const isBodyRequest = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
            
            const headers = {
                'Authorization': `Bearer ${token}`,
                ...options.headers,
            };

            if (isBodyRequest) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
                ...options,
                headers,
            });
            
            if (response.status === 401) {
                logout();
                throw new Error("User is not authenticated");
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const delayBeforeRetry = retryAfter ? parseInt(retryAfter, 10) * 1000 : currentDelay * 2;
                console.warn(`Spotify API Rate Limit Hit (429). Retrying in ${delayBeforeRetry}ms...`);
                await delay(delayBeforeRetry);
                currentDelay = delayBeforeRetry;
                retryCount++;
                continue;
            }
            return response;
        }
        throw new Error("Max retries reached for Spotify API");
    }, [token, logout]);

    useEffect(() => {
        if (creatorStatus || creatorError) {
            setShowCreatorStatus(true);
            setFadeCreatorStatusOut(false);
        } else {
            setShowCreatorStatus(false);
        }
    }, [creatorStatus, creatorError]);


    const getYesterdayDateParts = useCallback(() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const year = yesterday.getFullYear();
        const month = yesterday.toLocaleString('default', { month: 'short' }).toLowerCase();
        const day = String(yesterday.getDate()).padStart(2, '0');
        return { year, month, day };
    }, []);

    const resetCustomForm = useCallback(() => {
        setCustomPlaylistName('');
        setAiPrompt('');
    }, []);

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    const useSpotifyDataHelpers = (token) => {
        const fetchUniqueTrackUisAndArtistIdsFromPlaylists = useCallback(async (signal, onProgress) => {
            let allPlaylists = [];
            let nextPlaylistsUrl = '/me/playlists?limit=50';

            if (onProgress) onProgress({ phase: 'fetching_playlists', found: 0 });

            while (nextPlaylistsUrl) {
                const response = await spotifyFetch(nextPlaylistsUrl, { signal });

                if (!response.ok) {
                    throw new Error(`Failed to fetch playlists: ${response.status}`);
                }
                const data = await response.json();
                
                const filteredPlaylists = data.items.filter(playlist => 
                    playlist && playlist.name && !playlist.name.toLowerCase().includes('all my playlists songs')
                );
                
                allPlaylists = allPlaylists.concat(filteredPlaylists);
                
                if (onProgress) onProgress({ phase: 'fetching_playlists', found: allPlaylists.length });
                nextPlaylistsUrl = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
                await delay(50);
            }

            if (allPlaylists.length === 0) {
                throw new Error('You have no valid playlists in your Spotify library to process.');
            }
            
            const uniqueTrackUris = new Set();
            const uniqueArtistIds = new Set();
            let processedPlaylistsCount = 0;

            if (onProgress) onProgress({ phase: 'fetching_tracks', processed: 0, total: allPlaylists.length });

            const concurrency = 5; 
            for (let i = 0; i < allPlaylists.length; i += concurrency) {
                const chunk = allPlaylists.slice(i, i + concurrency);
                
                await Promise.all(chunk.map(async (playlist) => {
                    let nextTracksUrl = playlist.tracks.href.replace('https://api.spotify.com/v1', '');
                    while (nextTracksUrl) {
                        const response = await spotifyFetch(nextTracksUrl, { signal });
                        
                        if (!response.ok) {
                            console.warn(`Failed to fetch tracks for playlist "${playlist.name}" (${playlist.id}): ${response.status}`);
                            break;
                        }
                        const data = await response.json();
                        if (data.items) {
                            data.items.forEach(item => {
                                if (item.track && typeof item.track.uri === 'string' && item.track.uri.startsWith('spotify:track:')) {
                                    uniqueTrackUris.add(item.track.uri);
                                    item.track.artists.forEach(artist => uniqueArtistIds.add(artist.id));
                                }
                            });
                        }
                        nextTracksUrl = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
                    }
                }));
                
                processedPlaylistsCount += chunk.length;
                if (onProgress) onProgress({ 
                    phase: 'fetching_tracks', 
                    processed: Math.min(processedPlaylistsCount, allPlaylists.length), 
                    total: allPlaylists.length 
                });
            }
            
            return { uniqueTrackUris: Array.from(uniqueTrackUris), uniqueArtistIds: Array.from(uniqueArtistIds) };
        }, [spotifyFetch]);

        return { fetchUniqueTrackUisAndArtistIdsFromPlaylists };
    };

    const { fetchUniqueTrackUisAndArtistIdsFromPlaylists } = useSpotifyDataHelpers(token);


    const handleCreateWQXRPlaylist = useCallback(async () => {
        if(!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
        const controller = new AbortController();
        setWqxrAbortController(controller);
        const signal = controller.signal;

        setIsWqxrLoading(true);
        setCreatorError('');
        setCreatedPlaylist(null);
        setWqxrProgress(0);
        setCreatorStatus('Requesting playlist from proxy server...');

        try {
            const { year, month, day } = getYesterdayDateParts();
            const proxyResponse = await fetch(`http://localhost:3001/wqxr-playlist?year=${year}&month=${month}&day=${day}`, { signal });
            
            if (!proxyResponse.ok) throw new Error('Failed to fetch data from proxy server. Make sure it is running.');
    
            const data = await proxyResponse.json();
            const wqxrTracks = data.tracks;
    
            if (!wqxrTracks || wqxrTracks.length === 0) throw new Error('Could not parse any tracks from the WQXR playlist.');
            
            setCreatorStatus(`Found ${wqxrTracks.length} tracks from WQXR. Searching on Spotify...`);
            
            const trackUris = [];
            for (const [index, track] of wqxrTracks.entries()) {
                const response = await spotifyFetch(`/search?q=${encodeURIComponent(`track:${track.title} artist:${track.composer}`)}&type=track&limit=1`, { signal });
                const searchData = await response.json();
                if (searchData.tracks.items.length > 0) {
                    trackUris.push(searchData.tracks.items[0].uri);
                }
                const progress = ((index + 1) / wqxrTracks.length) * 100;
                setWqxrProgress(progress);
                await delay(50);
            }
    
            if (trackUris.length === 0) throw new Error('Could not find any of the WQXR tracks on Spotify.');
            
            setCreatorStatus('Creating new WQXR playlist...');
            const playlistName = `WQXR Daily - ${year}-${month}-${day}`;
            const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                method: 'POST',
                body: JSON.stringify({ name: playlistName, description: `A playlist of songs from WQXR on ${year}-${month}-${day}.`, public: false }), signal
            });
            const newPlaylist = await playlistResponse.json();
    
            setCreatorStatus('Adding tracks to the new WQXR playlist...');
            await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                body: JSON.stringify({ uris: trackUris }), signal
            });
            
            setCreatedPlaylist(newPlaylist);
            setCreatorStatus('WQXR playlist created successfully!');
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
        
        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('WQXR playlist creation cancelled.');
            } else {
                setCreatorError(e.message);
            }
            console.error(e);
        } finally {
            setIsWqxrLoading(false);
            setWqxrProgress(0);
            setWqxrAbortController(null);
        }
    }, [profile, token, getYesterdayDateParts, setLibraryVersion, spotifyFetch]);

    const handleCancelWQXRPlaylist = useCallback(() => {
        wqxrAbortController?.abort();
    }, [wqxrAbortController]);


    const handleCreateAiPlaylist = useCallback(async () => {
        setCreatorError('');
        setCreatorStatus('');
        setCreatedPlaylist(null);
    
        if (!customPlaylistName.trim()) {
            setCreatorError('Playlist name cannot be empty.');
            return;
        }
        if (!aiPrompt.trim()) {
            setCreatorError('Please describe the kind of playlist you want.');
            return;
        }
        if (!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
    
        const controller = new AbortController();
        setCustomAbortController(controller);
        const signal = controller.signal;
    
        setIsCustomLoading(true);
    
        const totalSongsToRequest = 200;
        const songsPerBatch = 50; 
        const numberOfBatches = Math.ceil(totalSongsToRequest / songsPerBatch); 
        let allTrackUris = new Set();
    
        try {
            for (let i = 0; i < numberOfBatches; i++) {
                setCreatorStatus(`Asking AI for song ideas (Batch ${i + 1}/${numberOfBatches})...`);
    
                const geminiPrompt = `Based on the following theme: "${aiPrompt}", generate a list of ${songsPerBatch} suitable songs. Include a mix of popular and less common tracks. This is batch ${i + 1} of ${numberOfBatches}, so please provide different songs than previous batches if possible.`;
                const payload = {
                    contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                "songs": {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            "track": { "type": "STRING" },
                                            "artist": { "type": "STRING" }
                                        },
                                        required: ["track", "artist"]
                                    }
                                }
                            },
                            required: ["songs"]
                        }
                    }
                };
    
                const apiKey = "AIzaSyAsb7lrYNWBzSIUe5RUCOCMib20FzAX61M";
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const geminiResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal
                });
    
                if (!geminiResponse.ok) {
                    const errorBody = await geminiResponse.text();
                    throw new Error(`AI request failed: ${geminiResponse.status}. ${errorBody}`);
                }
    
                const result = await geminiResponse.json();
                if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    console.warn(`AI response for batch ${i + 1} was empty or invalid.`);
                    continue; 
                }
    
                const songsText = result.candidates[0].content.parts[0].text;
                const aiSuggestions = JSON.parse(songsText).songs;
    
                if (!aiSuggestions || aiSuggestions.length === 0) {
                    console.warn(`AI did not suggest any songs for batch ${i + 1}.`);
                    continue;
                }
    
                setCreatorStatus(`Searching for suggested songs on Spotify (Batch ${i + 1}/${numberOfBatches})...`);
    
                for (const song of aiSuggestions) {
                    const query = encodeURIComponent(`track:${song.track} artist:${song.artist}`);
                    const searchResponse = await spotifyFetch(`/search?q=${query}&type=track&limit=1`, { signal });
                    const searchData = await searchResponse.json();
                    if (searchData.tracks.items.length > 0) {
                        allTrackUris.add(searchData.tracks.items[0].uri);
                    }
                    await delay(50);
                }
            }
    
            const uniqueTrackUris = Array.from(allTrackUris);
            if (uniqueTrackUris.length === 0) {
                throw new Error('Could not find any of the AI-suggested songs on Spotify.');
            }
    
            setCreatorStatus(`Creating playlist "${customPlaylistName}"...`);
            const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                method: 'POST',
                body: JSON.stringify({ name: customPlaylistName, description: `AI-generated playlist based on the prompt: "${aiPrompt}"`, public: false }),
                signal
            });
            const newPlaylist = await playlistResponse.json();
    
            setCreatorStatus(`Adding ${uniqueTrackUris.length} songs to the new playlist...`);
            const chunkSize = 100;
            for (let i = 0; i < uniqueTrackUris.length; i += chunkSize) {
                const chunk = uniqueTrackUris.slice(i, i + chunkSize);
                await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                    method: 'POST',
                    body: JSON.stringify({ uris: chunk }),
                    signal
                });
                await delay(100);
            }
    
            setCreatedPlaylist(newPlaylist);
            setCreatorStatus('AI-powered playlist created successfully!');
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
            resetCustomForm();
    
        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('AI playlist creation cancelled.');
            } else {
                setCreatorError(`An error occurred: ${e.message}`);
            }
            console.error(e);
        } finally {
            setIsCustomLoading(false);
            setCustomAbortController(null);
        }
    }, [profile, token, customPlaylistName, aiPrompt, setLibraryVersion, resetCustomForm, spotifyFetch]);

    const handleCancelAiPlaylist = useCallback(() => {
        customAbortController?.abort();
    }, [customAbortController]);


    const handleCreateTopTracksPlaylist = useCallback(async () => {
        if (!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
        if (!topTracksTimeRange) {
            setCreatorError('Please select a time range for your top tracks.');
            return;
        }

        const controller = new AbortController();
        setTopTracksAbortController(controller);
        const signal = controller.signal;

        setIsTopTracksLoading(true);
        setCreatorError('');
        setCreatedPlaylist(null);
        setTopTracksProgress(0);

        try {
            const fetchTopTracksPage = async (offset) => {
                const response = await spotifyFetch(`/me/top/tracks?limit=50&offset=${offset}&time_range=${topTracksTimeRange}`, { signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch top tracks page (offset ${offset}): ${response.status}`);
                }
                return await response.json();
            };

            setCreatorStatus('Fetching your top 100 tracks (Page 1/2)...');
            const page1 = await fetchTopTracksPage(0);
            setTopTracksProgress(25);

            await delay(100);

            setCreatorStatus('Fetching your top 100 tracks (Page 2/2)...');
            const page2 = await fetchTopTracksPage(50);
            const topTracks = [...page1.items, ...page2.items];
            setTopTracksProgress(50);


            if (!topTracks || topTracks.length === 0) {
                throw new Error('Could not find any top tracks. Listen to more music on Spotify!');
            }

            const trackUris = topTracks.map(track => track.uri);
            setTopTracksProgress(60);

            let timeLabel = '1 Year';
            if (topTracksTimeRange === 'short_term') timeLabel = '4 Weeks';
            if (topTracksTimeRange === 'medium_term') timeLabel = '6 Months';

            setCreatorStatus(`Found ${trackUris.length} top tracks. Creating playlist...`);
            const playlistName = `My Top 100 Tracks (${timeLabel}) - ${new Date().toLocaleDateString()}`;
            const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                method: 'POST',
                body: JSON.stringify({ name: playlistName, description: `A playlist generated from your top 100 Spotify tracks (${timeLabel}).`, public: false }), signal
            });
            setTopTracksProgress(75);
            const newPlaylist = await playlistResponse.json();

            setCreatorStatus('Adding tracks to your new top tracks playlist...');
            await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                body: JSON.stringify({ uris: trackUris }), signal
            });
            setTopTracksProgress(100);

            setCreatedPlaylist(newPlaylist);
            setCreatorStatus('Top 100 tracks playlist created successfully!');
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('Top tracks playlist creation cancelled.');
            } else {
                setCreatorError(e.message);
            }
            console.error(e);
        } finally {
            setIsTopTracksLoading(false);
            setTopTracksProgress(0);
            setTopTracksAbortController(null); 
        }
    }, [profile, token, setLibraryVersion, spotifyFetch, topTracksTimeRange]);

    const handleCancelTopTracksPlaylist = useCallback(() => {
        topTracksAbortController?.abort();
    }, [topTracksAbortController]);


    // --- CONSOLIDATION & CATEGORY LOGIC ---
    
    const handleConsolidatePlaylists = useCallback(async () => {
        if (!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
        const controller = new AbortController();
        setConsolidateAbortController(controller);
        const signal = controller.signal;

        setIsConsolidateLoading(true);
        setCreatorError('');
        setCreatedPlaylist(null);
        setConsolidateProgress(0);
        
        setCreatorStatus('Initializing library scan...');
        setConsolidatePhase('fetching_playlists');
        setConsolidatePlaylistsFound(0);
        setConsolidatePlaylistsProcessed(0);
        setConsolidateTotalToProcess(0);
        setConsolidateTracksAdded(0);

        try {
            // Scan all playlists EXCLUDING "All My Playlists Songs"
            const { uniqueTrackUris } = await fetchUniqueTrackUisAndArtistIdsFromPlaylists(signal, (info) => {
                if (info.phase === 'fetching_playlists') {
                    setConsolidatePhase('fetching_playlists');
                    setConsolidatePlaylistsFound(info.found);
                    setCreatorStatus(`Scanning library (Found ${info.found} playlists)...`);
                    setConsolidateProgress(5); 
                } else if (info.phase === 'fetching_tracks') {
                    setConsolidatePhase('fetching_tracks');
                    setConsolidatePlaylistsProcessed(info.processed);
                    setConsolidatePlaylistsFound(info.total);
                    setCreatorStatus(`Extracting unique songs (${info.processed} / ${info.total} playlists processed)...`);
                    setConsolidateProgress(10 + (info.processed / info.total) * 70); 
                }
            });
            
            const trackUrisArray = uniqueTrackUris;

            if (trackUrisArray.length === 0) {
                throw new Error('Could not find any unique songs across your playlists.');
            }

            const SPOTIFY_PLAYLIST_LIMIT = 10000; 
            const totalSongs = trackUrisArray.length;
            const numberOfPlaylists = Math.ceil(totalSongs / SPOTIFY_PLAYLIST_LIMIT);
            const createdPlaylistsInfo = [];
            
            setConsolidatePhase('creating_playlists');
            setConsolidateTotalToProcess(totalSongs);
            setConsolidateTracksAdded(0);

            for (let p = 0; p < numberOfPlaylists; p++) {
                const startIdx = p * SPOTIFY_PLAYLIST_LIMIT;
                const endIdx = Math.min(startIdx + SPOTIFY_PLAYLIST_LIMIT, totalSongs);
                const currentChunkOfTracks = trackUrisArray.slice(startIdx, endIdx);
                
                const playlistName = `All My Playlists Songs - Part ${p + 1} - ${new Date().toLocaleDateString()}`;
                const description = `Part ${p + 1} of a consolidated playlist containing all unique songs from your library.`;

                setCreatorStatus(`Creating target playlist "${playlistName}" (${p + 1}/${numberOfPlaylists})...`);
                const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                    method: 'POST',
                    body: JSON.stringify({ name: playlistName, description: description, public: false }), signal
                });

                const newPlaylist = await playlistResponse.json();
                createdPlaylistsInfo.push(newPlaylist);

                const chunkSizeForAdding = 100;
                for (let i = 0; i < currentChunkOfTracks.length; i += chunkSizeForAdding) {
                    const chunk = currentChunkOfTracks.slice(i, i + chunkSizeForAdding);
                    
                    await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                        method: 'POST',
                        body: JSON.stringify({ uris: chunk }), signal
                    });

                    setConsolidateTracksAdded(prev => prev + chunk.length);
                    const currentOverallProgress = (startIdx + i + chunk.length);
                    setConsolidateProgress(80 + (currentOverallProgress / totalSongs) * 20); 
                    
                    setCreatorStatus(`Adding ${chunk.length} songs to "${newPlaylist.name}"...`);
                    await delay(50);
                }
            }
            
            setConsolidateProgress(100);
            setCreatedPlaylist(createdPlaylistsInfo[0]);
            setCreatorStatus(`Successfully consolidated library! Created ${numberOfPlaylists} playlist(s) from ${totalSongs} unique songs.`);
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);

        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('Consolidation cancelled.');
            } else {
                setCreatorError(e.message);
            }
            console.error("Error creating consolidated playlist:", e);
        } finally {
            setIsConsolidateLoading(false);
            setConsolidateProgress(0);
            setConsolidateAbortController(null); 
            setConsolidatePhase('');
        }
    }, [profile, token, setLibraryVersion, fetchUniqueTrackUisAndArtistIdsFromPlaylists, spotifyFetch]);

    const handleCancelConsolidate = useCallback(() => {
        consolidateAbortController?.abort();
    }, [consolidateAbortController]);

    const handleScanConsolidatedForCategories = useCallback(async () => {
        if (!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
        const controller = new AbortController();
        setCategoryScanAbortController(controller);
        const signal = controller.signal;

        setIsCategoryScanLoading(true);
        setCreatorError('');
        setAvailableCategories([]);
        setCategoryScanProgress(0);
        
        setCategoryScanPlaylistsTotal(0);
        setCategoryScanPlaylistsProcessed(0);
        setCategoryScanArtistsTotal(0);
        setCategoryScanArtistsProcessed(0);
        
        setCategoryScanPhase('fetching_playlists');
        setCreatorStatus('Looking for your consolidated playlists...');

        try {
            // 1. Find all "All My Playlists Songs"
            let allPlaylists = [];
            let nextPlaylistsUrl = '/me/playlists?limit=50';
            while (nextPlaylistsUrl) {
                const response = await spotifyFetch(nextPlaylistsUrl, { signal });
                const data = await response.json();
                allPlaylists = allPlaylists.concat(data.items);
                nextPlaylistsUrl = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
            }

            const consolidatedPlaylists = allPlaylists.filter(p => p && p.name && p.name.toLowerCase().includes('all my playlists songs'));

            if (consolidatedPlaylists.length === 0) {
                throw new Error("No consolidated playlists found. Please run Step 1 'Consolidate All Playlists' first.");
            }

            // Group by date and find the most recent batch
            let latestTimestamp = 0;
            let latestDateStr = '';

            consolidatedPlaylists.forEach(p => {
                const parts = p.name.split('-');
                if (parts.length >= 3) {
                    const dateStr = parts[parts.length - 1].trim();
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime()) && dateObj.getTime() > latestTimestamp) {
                        latestTimestamp = dateObj.getTime();
                        latestDateStr = dateStr;
                    }
                }
            });

            let playlistsToScan = consolidatedPlaylists;
            if (latestDateStr) {
                playlistsToScan = consolidatedPlaylists.filter(p => p.name.includes(latestDateStr));
                
                // Warn if the playlist is very old
                const daysOld = (Date.now() - latestTimestamp) / (1000 * 60 * 60 * 24);
                if (daysOld > 30) {
                    throw new Error(`Your most recent consolidated playlists are from ${latestDateStr} (over a month ago). Please run Step 1 again to generate an up-to-date consolidation!`);
                }
            }

            setCategoryScanPhase('fetching_tracks');
            setCategoryScanPlaylistsTotal(playlistsToScan.length);
            setCreatorStatus(`Found ${playlistsToScan.length} recent consolidated playlist(s). Extracting songs...`);
            setCategoryScanProgress(10);

            // 2. Fetch tracks from only those playlists
            const trackDetailsMap = new Map();
            const uniqueArtistIds = new Set();
            let processedCount = 0;

            for (const playlist of playlistsToScan) {
                let nextTracksUrl = playlist.tracks.href.replace('https://api.spotify.com/v1', '');
                while (nextTracksUrl) {
                    const response = await spotifyFetch(nextTracksUrl, { signal });
                    const data = await response.json();
                    if (data.items) {
                        data.items.forEach(item => {
                            if (item.track && item.track.uri) {
                                if (!trackDetailsMap.has(item.track.uri)) {
                                    trackDetailsMap.set(item.track.uri, new Set());
                                }
                                item.track.artists.forEach(artist => {
                                    uniqueArtistIds.add(artist.id);
                                    trackDetailsMap.get(item.track.uri).add(artist.id);
                                });
                            }
                        });
                    }
                    nextTracksUrl = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
                }
                processedCount++;
                setCategoryScanPlaylistsProcessed(processedCount);
                setCategoryScanProgress(10 + (processedCount / playlistsToScan.length) * 30); // 10% to 40%
            }

            const artistIdsArray = Array.from(uniqueArtistIds);
            if (artistIdsArray.length === 0) {
                throw new Error('Could not find any artists in your consolidated playlists.');
            }
            
            setCategoryScanPhase('fetching_genres');
            setCategoryScanArtistsTotal(artistIdsArray.length);
            setCreatorStatus(`Found ${artistIdsArray.length} unique artists. Fetching specific genres...`);
            
            // 3. Fetch Artist Genres
            const artistToGenres = new Map();
            const batchSize = 50;
            for (let i = 0; i < artistIdsArray.length; i += batchSize) {
                const batch = artistIdsArray.slice(i, i + batchSize);
                const response = await spotifyFetch(`/artists?ids=${batch.join(',')}`, { signal });
                if (response.ok) {
                    const data = await response.json();
                    data.artists.forEach(artist => {
                        if(artist && artist.genres) {
                             artistToGenres.set(artist.id, artist.genres);
                        }
                    });
                }
                const currentProcessed = Math.min(i + batch.length, artistIdsArray.length);
                setCategoryScanArtistsProcessed(currentProcessed);
                setCategoryScanProgress(40 + (currentProcessed / artistIdsArray.length) * 40); // 40% to 80%
                await delay(50);
            }

            // 4. Fetch Spotify's broad Categories
            setCategoryScanPhase('mapping_categories');
            setCreatorStatus('Fetching Spotify broad categories and cross-referencing...');
            const categoriesResponse = await spotifyFetch(`/browse/categories?limit=50`, { signal });
            if (!categoriesResponse.ok) throw new Error("Failed to fetch categories from Spotify");
            const categoriesData = await categoriesResponse.json();
            
            const allCategories = categoriesData.categories.items.map(c => c.name);

            // 5. Map artists to broad categories
            const artistToBroadCategories = new Map();
            const foundBroadCategories = new Set();

            artistToGenres.forEach((genres, artistId) => {
                const matchedCats = new Set();
                genres.forEach(genre => {
                    const normG = genre.toLowerCase().replace(/[^a-z0-9]/g, '');
                    allCategories.forEach(cat => {
                        const normCat = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (normG.includes(normCat) || normCat.includes(normG)) {
                            matchedCats.add(cat);
                            foundBroadCategories.add(cat);
                        }
                    });
                });
                artistToBroadCategories.set(artistId, Array.from(matchedCats));
            });

            const trackDetails = Array.from(trackDetailsMap.entries()).map(([uri, artistsSet]) => ({
                uri,
                artistIds: Array.from(artistsSet)
            }));

            setCategoryFilterData({
                tracks: trackDetails,
                artistMap: artistToBroadCategories
            });
            
            setAvailableCategories(Array.from(foundBroadCategories).sort());
            setCategoryScanProgress(100);
            setCreatorStatus(`Scan complete! Found ${foundBroadCategories.size} broad categories matching your consolidated library. Select up to 3.`);

        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('Category scan cancelled.');
            } else {
                setCreatorError(e.message);
            }
            console.error("Error scanning library for categories:", e);
        } finally {
            setIsCategoryScanLoading(false);
            setCategoryScanProgress(0);
            setCategoryScanPhase('');
        }
    }, [profile, spotifyFetch]);

    const handleCreateCategoryPlaylist = useCallback(async () => {
        if (selectedCategories.length < 1 || selectedCategories.length > 3) {
            setCreatorError("Please select between 1 and 3 broad categories.");
            return;
        }
        if (!categoryMixName.trim()) {
            setCreatorError("Please enter a name for your category playlist.");
            return;
        }
        if (!categoryFilterData) {
            setCreatorError("Library data is missing. Please scan your consolidated songs again.");
            return;
        }
    
        const controller = new AbortController();
        setCategoryScanAbortController(controller);
        const signal = controller.signal;
    
        setIsCategoryScanLoading(true);
        setCreatorError('');
        setCategoryScanPhase('filtering_tracks');
        setCreatorStatus('Filtering your consolidated library to find matching songs...');
        setCategoryScanTracksAdded(0);
        setCategoryScanTracksTotal(0);
    
        try {
            // Filter local tracks to find songs that match ALL selected broad categories
            const matchedTrackUris = new Set();

            categoryFilterData.tracks.forEach(track => {
                // Gather all broad categories across all artists for this specific track
                const trackCategories = new Set();
                track.artistIds.forEach(artistId => {
                    const artistCats = categoryFilterData.artistMap.get(artistId) || [];
                    artistCats.forEach(cat => trackCategories.add(cat));
                });
                
                // Track must contain ALL the categories the user selected
                const matchesAllSelected = selectedCategories.every(cat => trackCategories.has(cat));
                
                if (matchesAllSelected) {
                    matchedTrackUris.add(track.uri);
                }
            });

            const finalTrackUris = Array.from(matchedTrackUris);

            if(finalTrackUris.length === 0) {
                throw new Error("No songs found in your library matching all of those specific categories combined.");
            }
            
            setCategoryScanPhase('creating_playlist');
            setCategoryScanTracksTotal(finalTrackUris.length);
            setCreatorStatus(`Found ${finalTrackUris.length} matching songs. Creating playlist "${categoryMixName}"...`);
            
            const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                method: 'POST',
                body: JSON.stringify({
                    name: categoryMixName,
                    description: `A collection of songs from your consolidated library matching ALL of these categories: ${selectedCategories.join(', ')}.`,
                    public: false
                }),
                signal
            });
            const newPlaylist = await playlistResponse.json();
    
            setCategoryScanPhase('adding_tracks');
            const chunkSize = 100;
            
            for (let i = 0; i < finalTrackUris.length; i += chunkSize) {
                const chunk = finalTrackUris.slice(i, i + chunkSize);
                await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                    method: 'POST',
                    body: JSON.stringify({ uris: chunk }),
                    signal
                });
                
                setCategoryScanTracksAdded(prev => prev + chunk.length);
                setCategoryScanProgress(((i + chunk.length) / finalTrackUris.length) * 100);
                setCreatorStatus(`Adding songs to playlist (${Math.floor((i + chunk.length) / finalTrackUris.length * 100)}%)...`);
                await delay(100);
            }
    
            setCreatedPlaylist(newPlaylist);
            setCreatorStatus("Category playlist created successfully!");
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
            setSelectedCategories([]);
            setCategoryMixName("");
            
            // Clear local mapping data after successful creation
            setCategoryFilterData(null);
            setAvailableCategories([]);
    
        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus("Category playlist creation cancelled.");
            } else {
                setCreatorError(e.message);
            }
            console.error("Error creating category playlist:", e);
        } finally {
            setIsCategoryScanLoading(false);
            setCategoryScanAbortController(null);
            setCategoryScanProgress(0);
            setCategoryScanPhase('');
            setCategoryScanTracksAdded(0);
            setCategoryScanTracksTotal(0);
        }
    }, [profile, spotifyFetch, selectedCategories, categoryMixName, categoryFilterData, setLibraryVersion]);

    const handleCancelCategoryScan = useCallback(() => {
        categoryScanAbortController?.abort();
    }, [categoryScanAbortController]);


    const handleFetchAvailableGenres = useCallback(async () => {
        if (!profile) {
            setCreatorError('Could not get user profile. Please try again.');
            return;
        }
        const controller = new AbortController();
        setGenreFusionAbortController(controller);
        const signal = controller.signal;

        setIsGenreFusionLoading(true);
        setCreatorError('');
        setAvailableGenres([]);
        setGenreFusionProgress(0);
        setCreatorStatus('Scanning your top tracks for genres...');

        try {
            const topTracksResponse = await spotifyFetch(`/me/top/tracks?limit=50&time_range=long_term`, { signal });
            if(!topTracksResponse.ok) throw new Error("Failed to fetch top tracks");
            const topTracksData = await topTracksResponse.json();

            const topTracksResponse2 = await spotifyFetch(`/me/top/tracks?limit=50&offset=50&time_range=long_term`, { signal });
            if(!topTracksResponse2.ok) throw new Error("Failed to fetch top tracks");
            const topTracksData2 = await topTracksResponse2.json();

            const topTracks = [...topTracksData.items, ...topTracksData2.items];
            const artistIds = new Set(topTracks.flatMap(track => track.artists.map(artist => artist.id)));
            
            const uniqueArtistIds = Array.from(artistIds);

            if (uniqueArtistIds.length === 0) {
                throw new Error('Could not find any artists in your top 100 tracks to determine genres.');
            }
            setCreatorStatus(`Found ${uniqueArtistIds.length} unique artists in your top 100. Fetching their genres...`);
            
            const genres = new Set();
            const batchSize = 50;
            for (let i = 0; i < uniqueArtistIds.length; i += batchSize) {
                const batch = uniqueArtistIds.slice(i, i + batchSize);
                const response = await spotifyFetch(`/artists?ids=${batch.join(',')}`, { signal });
                if (!response.ok) {
                    console.warn(`Failed to fetch artist batch: ${response.status}`);
                    continue;
                }
                const data = await response.json();
                data.artists.forEach(artist => {
                    artist?.genres?.forEach(genre => genres.add(genre));
                });
                setGenreFusionProgress(((i + batch.length) / uniqueArtistIds.length) * 100);
                await delay(50);
            }
            
            const sortedGenres = Array.from(genres).sort();
            setAvailableGenres(sortedGenres);
            setCreatorStatus(`Found ${sortedGenres.length} unique genres. Select 1 to 3 genres to create a fusion playlist.`);

        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus('Genre scan cancelled.');
            } else {
                setCreatorError(e.message);
            }
            console.error("Error fetching genres:", e);
        } finally {
            setIsGenreFusionLoading(false);
            setGenreFusionProgress(0);
        }
    }, [profile, spotifyFetch]);

    const handleCreateGenreFusionPlaylist = useCallback(async () => {
        if (selectedGenres.length < 1 || selectedGenres.length > 3) {
            setCreatorError("Please select between 1 and 3 genres.");
            return;
        }
        if (!genreFusionName.trim()) {
            setCreatorError("Please enter a name for your fusion playlist.");
            return;
        }
    
        const controller = new AbortController();
        setGenreFusionAbortController(controller);
        const signal = controller.signal;
    
        setIsGenreFusionLoading(true);
        setCreatorError('');
        setCreatorStatus('Creating your genre fusion playlist with AI...');
    
        try {
            const prompt = `Generate a playlist of 50 songs that blend the following genres: ${selectedGenres.join(', ')}. Include a mix of well-known and lesser-known artists that fit this fusion.`;
            
            let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = {
                contents: chatHistory,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "songs": {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: { "track": { "type": "STRING" }, "artist": { "type": "STRING" } },
                                    required: ["track", "artist"]
                                }
                            }
                        },
                        required: ["songs"]
                    }
                }
            };
            
            const apiKey = "AIzaSyAsb7lrYNWBzSIUe5RUCOCMib20FzAX61M"; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const geminiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal
            });

            if (!geminiResponse.ok) throw new Error(`AI request failed: ${geminiResponse.statusText}`);
            
            const result = await geminiResponse.json();
            if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error("AI response was empty or invalid. Please try a different fusion.");
            }
    
            const songsText = result.candidates[0].content.parts[0].text;
            const aiSuggestions = JSON.parse(songsText).songs;
    
            if (!aiSuggestions || aiSuggestions.length === 0) {
                throw new Error("The AI could not suggest any songs for this fusion.");
            }

            setCreatorStatus('Finding AI-suggested songs on Spotify...');
            const trackUris = new Set();
            for (const song of aiSuggestions) {
                const query = encodeURIComponent(`track:${song.track} artist:${song.artist}`);
                const searchResponse = await spotifyFetch(`/search?q=${query}&type=track&limit=1`, { signal });
                const searchData = await searchResponse.json();
                if (searchData.tracks.items.length > 0) {
                    trackUris.add(searchData.tracks.items[0].uri);
                }
                await delay(50);
            }

            const finalTrackUris = Array.from(trackUris);
            if(finalTrackUris.length === 0) {
                throw new Error("Could not find any of the AI's suggestions on Spotify.");
            }
            
            setCreatorStatus(`Creating playlist "${genreFusionName}"...`);
            const playlistResponse = await spotifyFetch(`/users/${profile.id}/playlists`, {
                method: 'POST',
                body: JSON.stringify({
                    name: genreFusionName,
                    description: `An AI-powered fusion of ${selectedGenres.join(', ')}.`,
                    public: false
                }),
                signal
            });
            const newPlaylist = await playlistResponse.json();
    
            await spotifyFetch(`/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                body: JSON.stringify({ uris: finalTrackUris }),
                signal
            });
    
            setCreatedPlaylist(newPlaylist);
            setCreatorStatus("Genre Fusion playlist created successfully!");
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
            setSelectedGenres([]);
            setGenreFusionName("");
    
        } catch (e) {
            if (e.name === 'AbortError') {
                setCreatorStatus("Genre fusion playlist creation cancelled.");
            } else {
                setCreatorError(e.message);
            }
            console.error("Error creating genre fusion playlist:", e);
        } finally {
            setIsGenreFusionLoading(false);
            setGenreFusionAbortController(null);
        }
    }, [profile, spotifyFetch, selectedGenres, genreFusionName, setLibraryVersion]);

    const handleCancelGenreFusion = useCallback(() => {
        genreFusionAbortController?.abort();
    }, [genreFusionAbortController]);

    // Effect for loading external Spotify SDK and Tailwind CSS.
    useEffect(() => {
        const tailwindScript = document.createElement('script');
        tailwindScript.src = 'https://cdn.tailwindcss.com';
        document.head.appendChild(tailwindScript);

        window.onSpotifyWebPlaybackSDKReady = () => {
            setSdkLoaded(true);
        };

        const sdkScript = document.createElement("script");
        sdkScript.src = "https://sdk.scdn.co/spotify-player.js";
        sdkScript.async = true;
        document.body.appendChild(sdkScript);

    }, []);

    // Effect for handling authentication token retrieval.
    useEffect(() => {
        const clientId = window.localStorage.getItem("spotify_client_id");
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        const getToken = async (authCode) => {
            const verifier = window.localStorage.getItem("code_verifier");

            const params = new URLSearchParams();
            params.append("client_id", clientId);
            params.append("grant_type", "authorization_code");
            params.append("code", authCode);
            params.append("redirect_uri", REDIRECT_URI);
            params.append("code_verifier", verifier);

            try {
                const result = await fetch(TOKEN_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params
                });

                if (!result.ok) throw new Error(`HTTP error! status: ${result.status}`);

                const { access_token } = await result.json();
                window.localStorage.setItem("spotify_token", access_token);
                setToken(access_token);
                // REMOVED replaceState to fix iframe security errors
            } catch (error) {
                console.error("Error fetching token:", error);
                logout();
            } finally {
                setIsLoading(false);
            }
        };

        if (code) {
            getToken(code);
        } else {
            const storedToken = window.localStorage.getItem("spotify_token");
            if (storedToken) {
                setToken(storedToken);
            }
            setIsLoading(false);
        }
    }, [logout]);

    // Effect for initializing the Spotify Web Playback SDK Player.
    useEffect(() => {
        if (token && sdkLoaded) {
            const playerInstance = new window.Spotify.Player({
                name: 'React Spotify Clone',
                getOAuthToken: cb => { cb(token); },
                volume: 0.5
            });

            setPlayer(playerInstance);

            playerInstance.addListener('ready', ({ device_id }) => {
                setIsPlayerReady(true);
                setDeviceId(device_id);
            });
            playerInstance.addListener('not_ready', () => {
                setIsPlayerReady(false);
                setDeviceId(null);
            });
            
            playerInstance.addListener('player_state_changed', ( state => {
                if (!state) return;
                setCurrentTrack(state.track_window.current_track);
                setIsPaused(state.paused);
                setPosition(state.position);
            }));

            playerInstance.connect();

            return () => {
                playerInstance.disconnect();
            };
        }
    }, [token, sdkLoaded]);
    
    // Effect to manually update the track position progress bar.
    useEffect(() => {
        let interval;
        if (!isPaused) {
            interval = setInterval(() => {
                setPosition(prevPosition => prevPosition + 1000);
            }, 1000);
        } else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isPaused]);
    
    if (isLoading && !token) {
        return <div className="h-screen w-full flex items-center justify-center bg-black text-white"><p>Loading...</p></div>;
    }

    return (
        <AppContext.Provider value={{ token, view, setView, selectedPlaylistId, setSelectedPlaylistId, player, isPlayerReady, currentTrack, isPaused, logout, deviceId, position, libraryVersion, setLibraryVersion, profile, setProfile, setPlaylistToEdit, setPlaylistToDelete,
            // Playlist Creator states and functions passed via context
            creatorStatus, creatorError, createdPlaylist, showCreatorStatus, setShowCreatorStatus, fadeCreatorStatusOut,
            isWqxrLoading, wqxrProgress, handleCreateWQXRPlaylist, handleCancelWQXRPlaylist,
            isCustomLoading, customPlaylistName, setCustomPlaylistName, aiPrompt, setAiPrompt, handleCreateAiPlaylist, handleCancelAiPlaylist, resetCustomForm,
            isTopTracksLoading, topTracksProgress, handleCreateTopTracksPlaylist, handleCancelTopTracksPlaylist, topTracksTimeRange, setTopTracksTimeRange,
            isConsolidateLoading, consolidateProgress, handleConsolidatePlaylists, handleCancelConsolidate,
            consolidatePhase, consolidatePlaylistsFound, consolidatePlaylistsProcessed, consolidateTotalToProcess, consolidateTracksAdded,
            isGenreFusionLoading, genreFusionProgress, handleFetchAvailableGenres, handleCreateGenreFusionPlaylist, handleCancelGenreFusion, availableGenres, selectedGenres, setSelectedGenres, genreFusionName, setGenreFusionName,
            isCategoryScanLoading, categoryScanProgress, categoryScanPhase, handleScanConsolidatedForCategories, handleCreateCategoryPlaylist, handleCancelCategoryScan, availableCategories, selectedCategories, setSelectedCategories, categoryMixName, setCategoryMixName, categoryFilterData,
            categoryScanPlaylistsTotal, categoryScanPlaylistsProcessed, categoryScanArtistsTotal, categoryScanArtistsProcessed, categoryScanTracksAdded, categoryScanTracksTotal,
            getYesterdayDateParts, // Pass getYesterdayDateParts to context
            spotifyFetch
        }}>
            <div className="h-screen w-full flex flex-col bg-black text-white font-sans">
                <div className="flex flex-1 overflow-y-hidden">
                    <Sidebar />
                    <MainContent />
                    <RightSidebar />
                </div>
                <PlayerBar />
                {playlistToEdit && <EditPlaylistModal playlist={playlistToEdit} onClose={() => setPlaylistToEdit(null)} />}
                {playlistToDelete && <DeleteConfirmationModal playlist={playlistToDelete} onClose={() => setPlaylistToDelete(null)} />}
            </div>
        </AppContext.Provider>
    );
}

// --- Layout Components ---

function Sidebar() {
    const { view, setView, selectedPlaylistId, setSelectedPlaylistId, logout, libraryVersion, profile, setPlaylistToEdit, setPlaylistToDelete } = useContext(AppContext);
    // Use the static URL and pass libraryVersion as a dependency
    const { data: playlists, loading: playlistsLoading } = useSpotifyApi('/me/playlists?limit=50', [libraryVersion]);
    const [activeMenu, setActiveMenu] = useState(null);
    
    const NavItem = ({ label, targetView, icon }) => (
           <li
            onClick={() => {
                setView(targetView);
                setSelectedPlaylistId(null);
            }}
            className={`flex items-center space-x-4 px-4 py-2 rounded-md cursor-pointer transition-colors duration-200 ${view === targetView && !selectedPlaylistId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
        >
            {icon}
            <span className="font-semibold">{label}</span>
        </li>
    );
    
    const handlePlaylistClick = (playlistId) => {
        setActiveMenu(null);
        setSelectedPlaylistId(playlistId);
        setView('playlist');
    };

    return (
        <nav className="w-64 bg-black p-2 flex-shrink-0 flex-col hidden sm:flex">
            <div className="bg-[#121212] rounded-lg p-2">
                <ul className="space-y-2">
                    <NavItem label="Home" targetView="home" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16"><path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L8.354 1.146zM2.5 14V7.707l5.5-5.5 5.5 5.5V14H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4H2.5z"/></svg>} />
                    <NavItem label="Search" targetView="search" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>} />
                    <NavItem label="Playlist Creator" targetView="creator" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16"><path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13c0-1.104 1.12-2 2.5-2s2.5.896 2.5 2zM1 7v2h6V7H1zm6-2v2H1V5h6zm1-2v2H1V3h6zm1-2v2H1V1h6zm1 10.117V15h8v-1.883l-4-3.117-4 3.117zM15.5 9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5V3.334l4-3.117 4 3.117V9z"/></svg>} />
                </ul>
            </div>
            <div className="bg-[#121212] rounded-lg p-2 mt-2 flex-1 overflow-y-auto">
                <h2 className="p-4 text-base font-semibold text-gray-300">Your Library</h2>
                <p className="px-4 text-xs text-gray-500 mb-2">Note: Playlists will only display up to 100 songs.</p>
                {playlistsLoading ? (
                    <p className="p-4 text-gray-400">Loading playlists...</p>
                ) : (
                    <ul className="space-y-1">
                        {playlists?.items.map(playlist => (
                            <li key={playlist.id} className={`group flex justify-between items-center text-gray-400 hover:text-white p-2 rounded-md cursor-pointer text-sm ${selectedPlaylistId === playlist.id ? 'bg-gray-800 !text-white' : ''}`}>
                                <span onClick={() => handlePlaylistClick(playlist.id)} className="truncate flex-1">{playlist.name}</span>
                                {profile?.id === playlist.owner.id && (
                                <div className="relative">
                                    <button onClick={() => setActiveMenu(activeMenu === playlist.id ? null : playlist.id)} className="hidden group-hover:block p-1">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>
                                    </button>
                                    {activeMenu === playlist.id && (
                                        <div className="absolute right-0 bottom-full mb-1 w-32 bg-gray-800 rounded-md shadow-lg z-10">
                                            <button onClick={() => {setPlaylistToEdit(playlist); setActiveMenu(null);}} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Edit details</button>
                                            <button onClick={() => {setPlaylistToDelete(playlist); setActiveMenu(null);}} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Delete</button>
                                        </div>
                                    )}
                                </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
             <div className="mt-auto pt-2">
                 <button onClick={logout} className="w-full text-left text-gray-400 hover:text-white p-4">Logout</button>
             </div>
        </nav>
    );
}

function MainContent() {
    const { view, selectedPlaylistId } = useContext(AppContext);
    
    return (
        <main className="flex-1 bg-gradient-to-b from-gray-800 to-[#121212] overflow-y-auto">
            <div className="p-6 md:p-8">
                {view === 'home' && <HomePage />}
                {view === 'playlist' && <PlaylistView playlistId={selectedPlaylistId} />}
                {view === 'creator' && <PlaylistCreator />}
                {view === 'search' && <SearchView />}
            </div>
        </main>
    );
}

function RightSidebar() {
    const { currentTrack } = useContext(AppContext);

    if (!currentTrack) {
       return (
        <aside className="w-80 bg-black p-2 flex-shrink-0 hidden lg:flex flex-col">
            <div className="bg-[#121212] rounded-lg p-4">
                <h2 className="font-bold text-white mb-4">Now Playing</h2>
                <p className="text-gray-400">No song selected.</p>
            </div>
        </aside>
       );
    }
    
    return (
        <aside className="w-80 bg-black p-2 flex-shrink-0 hidden lg:flex flex-col">
            <div className="bg-[#121212] rounded-lg p-4">
                <h2 className="font-bold text-white mb-4">Now Playing</h2>
                 <img src={currentTrack.album.images[0]?.url} alt="Album Art" className="w-full rounded-md mb-4"/>
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-white">{currentTrack.name}</h3>
                        <p className="text-sm text-gray-400">{currentTrack.artists.map(a => a.name).join(', ')}</p>
                    </div>
                    <button className="text-gray-400 hover:text-white">+</button>
                </div>
            </div>
        </aside>
    );
}

function VolumeControl() {
    const { player } = useContext(AppContext);
    const [volume, setVolume] = useState(50);

    const handleVolumeChange = (e) => {
        const newVolume = e.target.value;
        setVolume(newVolume);
        if (player) {
            player.setVolume(newVolume / 100);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
              <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/>
              <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.393-1.85a.5.5 0 0 1 .5-.099z"/>
            </svg>
            <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
        </div>
    );
}

function PlayerBar() {
    const { player, currentTrack, isPaused, isPlayerReady, position } = useContext(AppContext);
    const progressBarRef = useRef(null);

    const formatDuration = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    if (!isPlayerReady) return (
        <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-center text-center p-2">
            <p className="text-gray-400">Player not ready. Open a Spotify app and play a song to activate.</p>
        </footer>
    );
    
    if (!currentTrack) return (
        <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-center">
            <p className="text-gray-400">Select a song to play.</p>
        </footer>
    );

    const togglePlay = () => {
        player.togglePlay();
    };
    
    const progress = currentTrack ? (position / currentTrack.duration_ms) * 100 : 0;

    const handleSeek = (e) => {
        if (progressBarRef.current && currentTrack) {
            const rect = progressBarRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            const newPosition = percentage * currentTrack.duration_ms;
            player.seek(newPosition);
        }
    };

    return (
        <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-between px-4 text-white">
            <div className="w-1/4 flex items-center gap-3">
                <img src={currentTrack.album.images[0]?.url} alt="" className="w-14 h-14"/>
                <div>
                    <p className="font-semibold">{currentTrack.name}</p>
                    <p className="text-xs text-gray-400">{currentTrack.artists.map(a => a.name).join(', ')}</p>
                </div>
            </div>
            <div className="w-1/2 flex flex-col items-center gap-2">
                <div className="flex items-center gap-4 text-2xl">
                    <button onClick={() => player.previousTrack()} className="text-gray-400 hover:text-white">«</button>
                    <button onClick={togglePlay} className="p-2 bg-white text-black rounded-full hover:scale-105">
                        {isPaused ?
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> :
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        }
                    </button>
                    <button onClick={() => player.nextTrack()} className="text-gray-400 hover:text-white">»</button>
                </div>
                <div className="w-full flex items-center gap-2 text-xs text-gray-400">
                    <span>{formatDuration(position)}</span>
                    <div ref={progressBarRef} onClick={handleSeek} className="w-full h-1 bg-gray-700 rounded-full cursor-pointer group">
                        <div style={{ width: `${progress}%` }} className="h-full bg-white rounded-full group-hover:bg-green-500 relative">
                           <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100"></div>
                        </div>
                    </div>
                    <span>{formatDuration(currentTrack.duration_ms)}</span>
                </div>
            </div>
            <div className="w-1/4 flex justify-end items-center gap-4">
                <VolumeControl />
            </div>
        </footer>
    );
}


// --- API Fetch Hook ---
const useSpotifyApi = (url, deps = []) => { 
    const { spotifyFetch } = useContext(AppContext);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const CACHE_DURATION_MS = 5 * 60 * 1000;

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            if (!spotifyFetch || !url) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                const cachedData = localStorage.getItem(url);
                if (cachedData) {
                    const { data: storedData, timestamp } = JSON.parse(cachedData);
                    if (Date.now() - timestamp < CACHE_DURATION_MS) {
                        if (isMounted) {
                            setData(storedData);
                            setLoading(false);
                            return; 
                        }
                    } else {
                        localStorage.removeItem(url); 
                    }
                }
            } catch (cacheError) {
                console.warn("Error reading from cache:", cacheError);
            }

            if (isMounted) setLoading(true);

            try {
                const response = await spotifyFetch(url);
                 if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                 }
                const result = await response.json();
                
                try {
                    localStorage.setItem(url, JSON.stringify({ data: result, timestamp: Date.now() }));
                } catch (cacheError) {
                    console.warn("Error writing to cache:", cacheError);
                }

                if (isMounted) {
                    setData(result);
                }
            } catch (e) {
                if (isMounted && e.name !== 'AbortError') {
                    setError(e);
                }
                console.error(`useSpotifyApi fetch error for ${url}:`, e);
            } finally {
                if(isMounted){
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [url, spotifyFetch, ...deps]); 
    return { data, error, loading };
};


// --- View Components ---

function ContentSection({ title, children, error, loading }) {
    if (loading) return <div className="p-4 text-gray-400">Loading {title}...</div>
    if (error) return <p className="text-red-400 p-4">Could not load section: {error.message}</p>;
    if (!children || (Array.isArray(children) && children.length === 0)) return null;

    return (
        <section>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold hover:underline cursor-pointer">{title}</h2>
                <span className="text-sm font-bold text-gray-400 hover:underline cursor-pointer">Show all</span>
            </div>
            {children}
        </section>
    );
}

function PlaylistCard({ imageUrl, title, subtitle, isArtist = false, onClick }) {
    const imageClasses = isArtist ? "rounded-full shadow-lg" : "rounded-md shadow-lg";

    return (
        <div onClick={onClick} className="bg-[#181818] rounded-lg hover:bg-[#282828] transition-colors duration-300 group cursor-pointer p-4">
            <div className="relative mb-4">
                <img src={imageUrl || 'https://placehold.co/300x300/181818/FFFFFF?text=...'} alt={title} className={`w-full h-auto ${imageClasses}`}/>
                <div className="absolute bottom-2 right-2 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:bottom-4 transition-all duration-300 shadow-xl">
                    <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
            <h3 className="font-bold truncate">{title}</h3>
            <p className="text-sm text-gray-400 truncate">{subtitle}</p>
        </div>
    );
}

function HomePage() {
    const { setProfile } = useContext(AppContext);
    // Added v parameter to force refresh on libraryVersion change
    const { data: profileData } = useSpotifyApi('/me');
    const { data: topArtists, loading: artistsLoading, error: artistsError } = useSpotifyApi('/me/top/artists?limit=5');
    const { data: recent, loading: recentLoading, error: recentError } = useSpotifyApi('/me/player/recently-played?limit=6');

    useEffect(() => {
        if(profileData) {
            setProfile(profileData);
        }
    }, [profileData, setProfile]);
    
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    return (
        <div className="space-y-12">
            <h1 className="text-3xl font-bold">{getGreeting()}</h1>
            
            <ContentSection title="Recently Played" loading={recentLoading} error={recentError}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recent?.items.map(({ track }, index) => (
                       <div key={`${track.id}-${index}`} className="bg-white/10 hover:bg-white/20 transition-colors duration-300 rounded-md flex items-center gap-4 group cursor-pointer overflow-hidden">
                            <img src={track.album.images[0]?.url || 'https://placehold.co/80x80/181818/FFFFFF?text=...'} alt={track.name} className="w-20 h-20 flex-shrink-0"/>
                            <p className="font-semibold text-white flex-1 pr-2">{track.name}</p>
                            <div className="mr-4 w-12 h-12 bg-green-500 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl hidden sm:flex">
                               <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                       </div>
                    ))}
                </div>
            </ContentSection>

            <ContentSection title="Your Top Artists" loading={artistsLoading} error={artistsError}>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {topArtists?.items.map(artist => (
                       <PlaylistCard
                            key={artist.id}
                            imageUrl={artist.images[0]?.url}
                            title={artist.name}
                            subtitle="Artist"
                            isArtist={true}
                        />
                    ))}
                </div>
            </ContentSection>
        </div>
    );
}

function PlaylistView({ playlistId }) {
    const { spotifyFetch, deviceId, currentTrack, isPaused, setView, setSelectedPlaylistId, libraryVersion } = useContext(AppContext);
    const { data: playlist, loading } = useSpotifyApi(`/playlists/${playlistId}`, [libraryVersion]);
    const [error, setError] = useState(null);

    const playTrack = async (trackUri) => {
        if (!deviceId) {
            setError("No active player found. Please open Spotify on a device and start playing a song.");
            return;
        }
        setError(null);
        await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [trackUri] })
        });
    };

    const formatDuration = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${(seconds < 10 ? '0' : '')}${seconds}`;
    };

    if (loading) return <div className="text-center p-10">Loading playlist...</div>;
    if (!playlist) {
        // This can happen if a playlist was deleted.
        useEffect(() => {
            setView('home');
            setSelectedPlaylistId(null);
        }, [setView, setSelectedPlaylistId])
        return null;
    }

    return (
        <div className="text-white">
            <header className="flex items-end gap-6 mb-8">
                <img src={playlist.images?.[0]?.url || 'https://placehold.co/192x192/181818/FFFFFF?text=Playlist'} alt="" className="w-48 h-48 shadow-2xl"/>
                <div>
                    <p className="text-sm font-bold">Playlist</p>
                    <h1 className="text-5xl font-extrabold">{playlist.name}</h1>
                    <p className="text-gray-300 mt-2" dangerouslySetInnerHTML={{ __html: playlist.description }} />
                    {playlist.tracks.total > 100 && <p className="text-xs text-gray-400 mt-2">Note: Displaying the first 100 songs from this playlist.</p>}
                </div>
            </header>
            
            {error && <div className="bg-red-500 text-white p-3 rounded-md mb-4">{error}</div>}
            
            <div>
                {playlist.tracks?.items?.length > 0 ? (
                    playlist.tracks.items.slice(0, 100).map(({ track }, index) => {
                        if(!track) return null; // Tracks can sometimes be null if they are unavailable.
                        const isPlaying = currentTrack?.uri === track.uri && !isPaused;

                        return (
                            <div
                                key={track.id + index}
                                className="grid grid-cols-[auto,1fr,auto] items-center gap-4 p-2 rounded-md hover:bg-white/10 group"
                                onDoubleClick={() => playTrack(track.uri)}
                            >
                                <div className="text-gray-400 w-8 text-center flex items-center justify-center">
                                   { isPlaying ?
                                       ( <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-green-500 animate-pulse"><path d="M2.69231 6.30769V9.69231H0V6.30769H2.69231ZM6.76923 12.4615V3.53846H4.07692V12.4615H6.76923ZM10.8462 16V0H8.15385V16H10.8462ZM14.9231 12.4615V3.53846H12.2308V12.4615H14.9231Z" fill="currentColor"/></svg> ) :
                                       ( <>
                                           <span className="group-hover:hidden">{index + 1}</span>
                                           <button onClick={() => playTrack(track.uri)} className="text-white hidden group-hover:block">
                                               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                           </button>
                                       </> )
                                   }
                                </div>
                                <div className="flex items-center gap-4">
                                    <img src={track.album.images[2]?.url || 'https://placehold.co/40x40/181818/FFFFFF?text=...'} alt={track.name} className="w-10 h-10"/>
                                    <div>
                                        <p className={`font-semibold ${isPlaying ? 'text-green-500' : 'text-white'}`}>{track.name}</p>
                                        <p className="text-sm text-gray-400">{track.artists.map(a => a.name).join(', ')}</p>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-400">
                                    {formatDuration(track.duration_ms)}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <p className="text-gray-400 p-4">This playlist is empty.</p>
                )}
            </div>
        </div>
    );
}

function PlaylistCreator() {
    const {
        creatorStatus, creatorError, profile, spotifyFetch, setLibraryVersion,
        isWqxrLoading, wqxrProgress, handleCreateWQXRPlaylist, handleCancelWQXRPlaylist,
        isCustomLoading, customPlaylistName, setCustomPlaylistName, aiPrompt, setAiPrompt, handleCreateAiPlaylist, handleCancelAiPlaylist,
        isTopTracksLoading, topTracksProgress, handleCreateTopTracksPlaylist, handleCancelTopTracksPlaylist, topTracksTimeRange, setTopTracksTimeRange,
        isConsolidateLoading, consolidateProgress, handleConsolidatePlaylists, handleCancelConsolidate,
        consolidatePhase, consolidatePlaylistsFound, consolidatePlaylistsProcessed, consolidateTotalToProcess, consolidateTracksAdded,
        isGenreFusionLoading, genreFusionProgress, handleFetchAvailableGenres, handleCreateGenreFusionPlaylist, handleCancelGenreFusion, availableGenres, selectedGenres, setSelectedGenres, genreFusionName, setGenreFusionName,
        isCategoryScanLoading, categoryScanProgress, categoryScanPhase, handleScanConsolidatedForCategories, handleCreateCategoryPlaylist, handleCancelCategoryScan, availableCategories, selectedCategories, setSelectedCategories, categoryMixName, setCategoryMixName, categoryFilterData,
        categoryScanPlaylistsTotal, categoryScanPlaylistsProcessed, categoryScanArtistsTotal, categoryScanArtistsProcessed, categoryScanTracksAdded, categoryScanTracksTotal,
        getYesterdayDateParts, showCreatorStatus, setShowCreatorStatus, fadeCreatorStatusOut
    } = useContext(AppContext);

    const isAnyCurationLoading = isWqxrLoading || isCustomLoading || isTopTracksLoading || isConsolidateLoading || isGenreFusionLoading || isCategoryScanLoading;
    const { year: yesterdayYear, month: yesterdayMonth, day: yesterdayDay } = getYesterdayDateParts();

    const handleGenreSelect = (genre) => {
        setSelectedGenres(prev => 
            prev.includes(genre) ? prev.filter(g => g !== genre) : (prev.length < 3 ? [...prev, genre] : prev)
        );
    };

    const handleCategorySelect = (category) => {
        setSelectedCategories(prev => 
            prev.includes(category) ? prev.filter(c => c !== category) : (prev.length < 3 ? [...prev, category] : prev)
        );
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-4">Playlist Creator</h1>
            
            <div className="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm py-3 mb-4">
                {showCreatorStatus && (creatorError || creatorStatus) && (
                    <div className={`p-3 rounded-md flex items-center justify-between transition-opacity duration-2000 ${creatorError ? 'bg-red-800' : 'bg-blue-800'} ${fadeCreatorStatusOut ? 'opacity-0' : 'opacity-100'}`}>
                        <p className="flex-1">{creatorError || creatorStatus}</p>
                        <button 
                            onClick={() => setShowCreatorStatus(false)} 
                            className="ml-4 text-white hover:text-gray-300 focus:outline-none"
                            aria-label="Close status"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-8">
                
                {/* --- CONSOLIDATE & CATEGORIZE LIBRARY --- */}
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Consolidate Your Playlists</h2>
                    <p className="text-gray-400 mb-4">
                        Consolidate your songs into one seamless list with no duplicates. Once consolidated, you have the option to scan those specific songs and automatically generate new playlists based on broad genre categories!
                    </p>

                    {/* Step 1: Consolidate */}
                    <div className="mb-6 p-4 bg-gray-900 rounded-md border border-gray-700">
                        <h3 className="font-semibold text-white mb-2">Step 1: Consolidate All Songs</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Scans your entire library (excluding any previously consolidated lists) and creates "All My Playlists Songs" with zero duplicates.
                        </p>
                        <button
                            onClick={handleConsolidatePlaylists}
                            disabled={isAnyCurationLoading}
                            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                        >
                            {isConsolidateLoading ? 'Consolidating...' : "Consolidate All Playlists"}
                        </button>
                        {isConsolidateLoading && (
                            <button
                                onClick={handleCancelConsolidate}
                                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                            >
                                Cancel
                            </button>
                        )}
                        
                        {isConsolidateLoading && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>Overall Progress</span>
                                        <span>{Math.round(consolidateProgress)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                        <div className="bg-orange-500 h-2 rounded-full transition-all duration-300" style={{ width: `${consolidateProgress}%` }}></div>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-400 mb-1">
                                        Phase 1: Finding Playlists ({consolidatePlaylistsFound} found)
                                    </p>
                                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                                        <div className={`h-1.5 rounded-full transition-all duration-300 ${consolidatePhase === 'fetching_playlists' ? 'bg-orange-400 animate-pulse w-full' : (consolidatePlaylistsFound > 0 ? 'bg-green-500 w-full' : 'w-0')}`}></div>
                                    </div>
                                </div>

                                {(consolidatePhase === 'fetching_tracks' || consolidatePhase === 'creating_playlists') && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">
                                            Phase 2: Extracting Songs ({consolidatePlaylistsProcessed} / {consolidatePlaylistsFound} playlists processed)
                                        </p>
                                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full transition-all duration-300 ${consolidatePhase === 'creating_playlists' ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${(consolidatePlaylistsProcessed / Math.max(1, consolidatePlaylistsFound)) * 100}%` }}></div>
                                        </div>
                                    </div>
                                )}

                                {consolidatePhase === 'creating_playlists' && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">
                                            Phase 3: Populating Final Playlist ({consolidateTracksAdded} / {consolidateTotalToProcess} songs added)
                                        </p>
                                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                                            <div className="bg-orange-400 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(consolidateTracksAdded / Math.max(1, consolidateTotalToProcess)) * 100}%` }}></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Category Mix */}
                    <div className="p-4 bg-gray-900 rounded-md border border-gray-700">
                        <h3 className="font-semibold text-white mb-2">Step 2: Create Category Mix</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Scans your "All My Playlists Songs" to identify the broad categories within them. You can then quickly filter those exact songs into a new, smaller playlist.
                        </p>
                        <button
                            onClick={handleScanConsolidatedForCategories}
                            disabled={isAnyCurationLoading}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                        >
                            {isCategoryScanLoading && categoryScanPhase !== 'filtering_tracks' && categoryScanPhase !== 'creating_playlist' && categoryScanPhase !== 'adding_tracks' ? 'Scanning...' : "Scan Consolidated Songs for Categories"}
                        </button>
                        
                        {isCategoryScanLoading && categoryScanPhase !== 'filtering_tracks' && categoryScanPhase !== 'creating_playlist' && categoryScanPhase !== 'adding_tracks' && (
                            <button
                                onClick={handleCancelCategoryScan}
                                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                            >
                                Cancel
                            </button>
                        )}
                        
                        {isCategoryScanLoading && (
                            <div className="mt-4 bg-gray-900 p-4 rounded-md space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>Overall Progress</span>
                                        <span>{Math.round(categoryScanProgress)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                        <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${categoryScanProgress}%` }}></div>
                                    </div>
                                </div>

                                {(categoryScanPhase === 'fetching_playlists' || categoryScanPlaylistsTotal > 0) && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">
                                            Step 1: Extracting Songs ({categoryScanPlaylistsProcessed} / {categoryScanPlaylistsTotal} playlists processed)
                                        </p>
                                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full transition-all duration-300 ${categoryScanPhase === 'fetching_tracks' || categoryScanPhase === 'fetching_playlists' ? 'bg-blue-400' : 'bg-green-500'}`} style={{ width: categoryScanPlaylistsTotal > 0 ? `${(categoryScanPlaylistsProcessed / categoryScanPlaylistsTotal) * 100}%` : '0%' }}></div>
                                        </div>
                                    </div>
                                )}

                                {(categoryScanPhase === 'fetching_genres' || categoryScanPhase === 'mapping_categories' || categoryScanArtistsTotal > 0) && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">
                                            Step 2: Fetching Genres ({categoryScanArtistsProcessed} / {categoryScanArtistsTotal} artists processed)
                                        </p>
                                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full transition-all duration-300 ${categoryScanPhase === 'fetching_genres' ? 'bg-blue-400' : 'bg-green-500'}`} style={{ width: categoryScanArtistsTotal > 0 ? `${(categoryScanArtistsProcessed / categoryScanArtistsTotal) * 100}%` : '0%' }}></div>
                                        </div>
                                    </div>
                                )}

                                {(categoryScanPhase === 'filtering_tracks' || categoryScanPhase === 'creating_playlist' || categoryScanPhase === 'adding_tracks') && (
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">
                                            Step 3: Populating Target Playlist ({categoryScanTracksAdded} / {categoryScanTracksTotal} songs added)
                                        </p>
                                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full transition-all duration-300 ${categoryScanPhase === 'adding_tracks' ? 'bg-blue-400' : (categoryScanTracksTotal > 0 && categoryScanTracksAdded === categoryScanTracksTotal ? 'bg-green-500' : 'bg-blue-400')}`} style={{ width: categoryScanTracksTotal > 0 ? `${(categoryScanTracksAdded / categoryScanTracksTotal) * 100}%` : '0%' }}></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {availableCategories.length > 0 && !isCategoryScanLoading && (
                            <div className="mt-6 border-t border-gray-700 pt-4">
                                <h3 className="text-lg font-semibold mb-2">Categories Found in your Consolidated Songs:</h3>
                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-gray-800 rounded-md">
                                    {availableCategories.map(category => (
                                        <button
                                            key={category}
                                            onClick={() => handleCategorySelect(category)}
                                            disabled={!selectedCategories.includes(category) && selectedCategories.length >= 3}
                                            className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedCategories.includes(category) ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} ${!selectedCategories.includes(category) && selectedCategories.length >= 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {category}
                                        </button>
                                    ))}
                                </div>

                                {selectedCategories.length > 0 && (
                                    <div className="mt-4">
                                         <h3 className="text-lg font-semibold mb-2">Selected Categories for Mix (Songs must contain ALL selected):</h3>
                                         <p className="text-gray-400 italic mb-4">{selectedCategories.join(' + ')}</p>
                                         <div>
                                            <label className="block mb-1 text-sm font-medium text-gray-300">Playlist Name</label>
                                            <input type="text" value={categoryMixName} onChange={e => setCategoryMixName(e.target.value)} placeholder="My Consolidated Category Mix" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                                         </div>
                                         <button
                                            onClick={handleCreateCategoryPlaylist}
                                            disabled={isAnyCurationLoading || selectedCategories.length < 1 || selectedCategories.length > 3}
                                            className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                                        >
                                            {isCategoryScanLoading && (categoryScanPhase === 'filtering_tracks' || categoryScanPhase === 'creating_playlist' || categoryScanPhase === 'adding_tracks') ? 'Creating...' : 'Create Category Mix Playlist'}
                                        </button>
                                         {isCategoryScanLoading && (categoryScanPhase === 'filtering_tracks' || categoryScanPhase === 'creating_playlist' || categoryScanPhase === 'adding_tracks') && (
                                            <button
                                                onClick={handleCancelCategoryScan}
                                                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* --- GENRE FUSION FROM TOP TRACKS --- */}
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Genre Fusion Creator (Top Tracks)</h2>
                    <p className="text-gray-400 mb-4">
                        Discover new music by blending specific sub-genres from your top 100 tracks. Start by scanning for your available genres, and we'll use AI to find new songs that match the vibe.
                    </p>
                    <button
                        onClick={handleFetchAvailableGenres}
                        disabled={isAnyCurationLoading}
                        className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                    >
                        {isGenreFusionLoading ? 'Scanning...' : "Scan My Top 100 Genres"}
                    </button>
                    
                    {isGenreFusionLoading && (
                        <button
                            onClick={handleCancelGenreFusion}
                            className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                        >
                            Cancel
                        </button>
                    )}
                    
                    {isGenreFusionLoading && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-600 rounded-full h-2.5">
                                <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: `${genreFusionProgress}%` }}></div>
                            </div>
                            <p className="text-center text-sm text-gray-300 mt-1">{Math.round(genreFusionProgress)}%</p>
                        </div>
                    )}

                    {availableGenres.length > 0 && !isGenreFusionLoading && (
                        <div className="mt-6">
                            <h3 className="text-lg font-semibold mb-2">Your Available Genres:</h3>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-gray-900 rounded-md">
                                {availableGenres.map(genre => (
                                    <button
                                        key={genre}
                                        onClick={() => handleGenreSelect(genre)}
                                        disabled={!selectedGenres.includes(genre) && selectedGenres.length >= 3}
                                        className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedGenres.includes(genre) ? 'bg-green-500 text-black' : 'bg-gray-700 hover:bg-gray-600'} ${!selectedGenres.includes(genre) && selectedGenres.length >= 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {genre}
                                    </button>
                                ))}
                            </div>

                            {selectedGenres.length > 0 && (
                                <div className="mt-4">
                                     <h3 className="text-lg font-semibold mb-2">Selected Genres for Fusion:</h3>
                                     <p className="text-gray-400 italic mb-4">{selectedGenres.join(', ')}</p>
                                     <div>
                                        <label className="block mb-1 text-sm font-medium text-gray-300">Playlist Name</label>
                                        <input type="text" value={genreFusionName} onChange={e => setGenreFusionName(e.target.value)} placeholder="My Genre Fusion" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                                     </div>
                                     <button
                                        onClick={handleCreateGenreFusionPlaylist}
                                        disabled={isAnyCurationLoading || selectedGenres.length < 1 || selectedGenres.length > 3}
                                        className="mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                                    >
                                        {isGenreFusionLoading ? 'Creating...' : 'Create Genre Fusion Playlist'}
                                    </button>
                                     {isGenreFusionLoading && (
                                        <button
                                            onClick={handleCancelGenreFusion}
                                            className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* --- OTHER TOOLS --- */}
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">WQXR Daily Playlist</h2>
                    <p className="text-gray-400 mb-4">
                        Create a new playlist based on the music played yesterday ({yesterdayDay}-{yesterdayMonth}-{yesterdayYear}) on WQXR.
                    </p>
                    <button
                        onClick={handleCreateWQXRPlaylist}
                        disabled={isAnyCurationLoading}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                    >
                        {isWqxrLoading ? 'Creating...' : "Create Yesterday's Playlist"}
                    </button>
                    {isWqxrLoading && (
                        <button
                            onClick={handleCancelWQXRPlaylist}
                            className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                        >
                            Cancel
                        </button>
                    )}
                    {isWqxrLoading && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-600 rounded-full h-2.5">
                                <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${wqxrProgress}%` }}></div>
                            </div>
                            <p className="text-center text-sm text-gray-300 mt-1">{Math.round(wqxrProgress)}%</p>
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">Playlist from Your Top Tracks</h2>
                    <p className="text-gray-400 mb-4">
                        Instantly create a new playlist composed of your 100 most listened to tracks on Spotify.
                    </p>
                    <div className="mb-6">
                        <label className="block mb-2 text-sm font-medium text-gray-300">Songs from:</label>
                        <div className="flex flex-wrap gap-3">
                            {[
                                { id: 'long_term', label: '1 Year' },
                                { id: 'medium_term', label: '6 Months' },
                                { id: 'short_term', label: '4 Weeks' }
                            ].map(range => (
                                <button
                                    key={range.id}
                                    onClick={() => setTopTracksTimeRange(range.id)}
                                    disabled={isAnyCurationLoading}
                                    className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${topTracksTimeRange === range.id ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} disabled:opacity-50`}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={handleCreateTopTracksPlaylist}
                        disabled={isAnyCurationLoading || !topTracksTimeRange}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                    >
                        {isTopTracksLoading ? 'Creating...' : "Create Top Tracks Playlist"}
                    </button>
                    {isTopTracksLoading && (
                        <button
                            onClick={handleCancelTopTracksPlaylist}
                            className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                        >
                            Cancel
                        </button>
                    )}
                    {isTopTracksLoading && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-600 rounded-full h-2.5">
                                <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${topTracksProgress}%` }}></div>
                            </div>
                            <p className="text-center text-sm text-gray-300 mt-1">{Math.round(topTracksProgress)}%</p>
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">AI-Powered Playlist Creator</h2>
                    <p className="text-gray-400 mb-4">
                        Describe the kind of playlist you want, and let AI build it for you. The AI will generate a playlist with up to 200 songs.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label className="block mb-1 text-sm font-medium text-gray-300">Playlist Name</label>
                            <input type="text" value={customPlaylistName} onChange={e => setCustomPlaylistName(e.target.value)} placeholder="My Awesome Mix" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                        </div>
                        <div>
                            <label className="block mb-1 text-sm font-medium text-gray-300">Describe your playlist</label>
                            <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g., an upbeat roadtrip playlist with 90s alternative rock" rows="3" className="w-full p-2 bg-gray-700 rounded-md border-gray-600"></textarea>
                        </div>
                    </div>
                    <button
                        onClick={handleCreateAiPlaylist}
                        disabled={isAnyCurationLoading}
                        className="mt-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                    >
                        {isCustomLoading ? 'Creating...' : "Create AI Playlist"}
                    </button>
                    {isCustomLoading && (
                        <button
                            onClick={handleCancelAiPlaylist}
                            className="ml-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- NEW --- SearchView Component
function SearchView() {
    const { spotifyFetch } = useContext(AppContext);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Debounce search input to avoid excessive API calls
    useEffect(() => {
        if (!query.trim()) {
            setResults(null);
            return;
        }

        const searchTimer = setTimeout(async () => {
            setLoading(true);
            const searchQuery = encodeURIComponent(query);
            const type = "track,artist,album";
            const response = await spotifyFetch(`/search?q=${searchQuery}&type=${type}&limit=10`);
            const data = await response.json();
            setResults(data);
            setLoading(false);
        }, 500);

        return () => clearTimeout(searchTimer);
    }, [query, spotifyFetch]);

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold">Search</h1>
            <div className="relative">
                <input
                    type="text"
                    placeholder="What do you want to listen to?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full p-4 pl-12 bg-gray-700 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <svg className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>
            </div>

            {loading && <p>Searching...</p>}
            
            {results && (
                <div className="space-y-10">
                   {results.tracks?.items.length > 0 && <TrackResults tracks={results.tracks.items} />}
                   {results.artists?.items.length > 0 && <ArtistResults artists={results.artists.items} />}
                   {results.albums?.items.length > 0 && <AlbumResults albums={results.albums.items} />}
                </div>
            )}
        </div>
    );
}

function TrackResults({ tracks }) {
    const { playTrack } = usePlayerActions();
    const formatDuration = (ms) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };
    return (
           <ContentSection title="Songs">
            {tracks.map(track => (
                <div key={track.id} onDoubleClick={() => playTrack(track.uri)} className="grid grid-cols-[auto,1fr,auto] items-center gap-4 p-2 rounded-md hover:bg-white/10 group">
                    <img src={track.album.images[2]?.url || 'https://placehold.co/40x40/181818/FFFFFF?text=...'} alt={track.name} className="w-10 h-10"/>
                    <div>
                        <p className="font-semibold text-white">{track.name}</p>
                        <p className="text-sm text-gray-400">{track.artists.map(a => a.name).join(', ')}</p>
                    </div>
                    <p className="text-sm text-gray-400">{formatDuration(track.duration_ms)}</p>
                </div>
            ))}
        </ContentSection>
    )
}

function ArtistResults({ artists }) {
    return (
        <ContentSection title="Artists">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {artists.map(artist => (
                    <PlaylistCard key={artist.id} imageUrl={artist.images[0]?.url} title={artist.name} subtitle="Artist" isArtist={true} />
                ))}
            </div>
        </ContentSection>
    )
}

function AlbumResults({ albums }) {
    return (
        <ContentSection title="Albums">
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {albums.map(album => (
                    <PlaylistCard key={album.id} imageUrl={album.images[0]?.url} title={album.name} subtitle={album.artists.map(a => a.name).join(', ')} />
                ))}
            </div>
        </ContentSection>
    )
}

function usePlayerActions() {
    const { spotifyFetch, deviceId } = useContext(AppContext);
    const playTrack = (trackUri) => {
        if (!deviceId) {
            console.error("No active player found.");
            return;
        }
        spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [trackUri] })
        });
    }
    return { playTrack };
}


function EditPlaylistModal({ playlist, onClose }) {
    const { spotifyFetch, setLibraryVersion } = useContext(AppContext);
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError("");
        try {
            const response = await spotifyFetch(`/playlists/${playlist.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name, description })
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Failed to update playlist.');
            }
            localStorage.removeItem('/me/playlists?limit=50');
            localStorage.removeItem(`/playlists/${playlist.id}`);
            setLibraryVersion(v => v + 1);
            onClose();
        } catch (error) {
            console.error("Error updating playlist:", error);
            setError(error.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
       <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-[#282828] rounded-lg shadow-2xl w-full max-w-md">
                <form onSubmit={handleSave}>
                    <div className="p-6">
                        <h3 className="text-xl font-semibold text-white mb-4">Edit details</h3>
                        {error && <p className="text-red-400 mb-4">{error}</p>}
                        <div className="space-y-4">
                             <div>
                                 <label htmlFor="name" className="block text-sm font-bold text-gray-300 mb-1">Name</label>
                                 <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required className="w-full p-2 bg-gray-700 rounded-md border-gray-600"/>
                             </div>
                             <div>
                                 <label htmlFor="description" className="block text-sm font-bold text-gray-300 mb-1">Description</label>
                                 <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows="3" className="w-full p-2 bg-gray-700 rounded-md border-gray-600"></textarea>
                             </div>
                        </div>
                    </div>
                    <div className="bg-gray-800 px-6 py-4 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent rounded-md hover:bg-gray-700">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-black bg-white rounded-full hover:scale-105 disabled:opacity-50">
                            {isSaving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}


function DeleteConfirmationModal({ playlist, onClose }) {
    const { spotifyFetch, setLibraryVersion, setView, setSelectedPlaylistId } = useContext(AppContext);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState("");
    
    const handleDelete = async () => {
        setIsDeleting(true);
        setError("");
        try {
            const response = await spotifyFetch(`/playlists/${playlist.id}/followers`, {
                method: 'DELETE',
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Failed to delete playlist.');
            }
            localStorage.removeItem('/me/playlists?limit=50');
            setLibraryVersion(v => v + 1);
            setSelectedPlaylistId(null);
            setView('home');
            onClose();
        } catch (error) {
            console.error("Error deleting playlist:", error);
            setError("Could not delete playlist: " + error.message);
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-[#282828] rounded-lg shadow-2xl w-full max-w-md p-6">
                <h3 className="text-xl font-semibold text-white mb-2">Delete playlist</h3>
                <p className="text-gray-300 mb-6">Are you sure you want to delete "{playlist.name}"? This action cannot be undone.</p>
                {error && <p className="text-red-400 mb-4">{error}</p>}
                <div className="flex justify-end space-x-4">
                     <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-gray-300 bg-transparent rounded-md hover:bg-gray-700 disabled:opacity-50">Cancel</button>
                     <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:opacity-50">
                         {isDeleting ? "Deleting..." : "Yes, Delete"}
                     </button>
                </div>
            </div>
        </div>
    );
}