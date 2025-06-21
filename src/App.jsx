import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';

// --- Spotify API Configuration ---
// The redirect URI is set to the current window's origin.
const REDIRECT_URI = window.location.origin; 
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
// Scopes define the permissions the app is requesting from the user.
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
    "streaming", // Required for Web Playback SDK
    "user-read-playback-state", // Required for Web Playback SDK
    "user-modify-playback-state" // Required for Web Playback SDK
].join(" ");


// --- React Context for State Management ---
// AppContext provides a way to pass data through the component tree without prop-drilling.
const AppContext = createContext();

// --- PKCE Helper Functions ---
// These functions are used for the secure PKCE authentication flow.

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
    return btoa(String.fromCharCode.apply(null, [...new Uint9Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// --- Login Screen Component ---
// This component handles the initial user login and Spotify authorization.
function LoginScreen() {
    const [clientId, setClientId] = useState("");
    const [loginError, setLoginError] = useState("");
    const [copied, setCopied] = useState(false);
    
    // On component mount, check for a stored client ID or any login errors from the redirect.
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

    // Handles the login process by redirecting the user to Spotify's authorization page.
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
    
    // Copies the Redirect URI to the clipboard for easy setup in the Spotify Developer Dashboard.
    const copyToClipboard = () => {
        const textToCopy = REDIRECT_URI;
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white p-4">
            <div className="text-center bg-gray-800 p-8 rounded-lg shadow-2xl max-w-2xl w-full">
                <h1 className="text-4xl font-bold mb-2">Connect to Spotify</h1>
                <p className="text-gray-400 mb-6">Please send your Spotify email to efjmnz@hotmail.com and I will send you the Client ID.</p>
                
                {/* <div className="bg-gray-900 p-4 rounded-lg mb-6 text-left">
                    <label className="text-sm font-semibold text-gray-300">Your Redirect URI:</label>
                    <div className="flex items-center justify-between mt-2">
                        <code className="text-green-400 bg-black p-2 rounded-md text-sm break-all">{REDIRECT_URI}</code>
                        <button onClick={copyToClipboard} className={`ml-4 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${copied ? 'bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Copy this exact URI and paste it into the "Redirect URIs" field in your Spotify app's settings.</p>
                </div> */}
                
                {/* <p className="text-gray-400 mb-4">Once configured, enter your Client ID below to log in.</p> */}

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


// --- Main App Component ---
// This is the root component that manages the overall application state and layout.
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
    const [libraryVersion, setLibraryVersion] = useState(0); // Used to trigger refetches
    const [profile, setProfile] = useState(null);
    const [playlistToEdit, setPlaylistToEdit] = useState(null);
    const [playlistToDelete, setPlaylistToDelete] = useState(null);


    const logout = useCallback(() => {
        setToken(null);
        if(player) player.disconnect();
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("spotify_client_id");
        window.localStorage.removeItem("code_verifier");
        window.history.replaceState(null, null, window.location.pathname);
        setView('home');
        setSelectedPlaylistId(null);
    }, [player]);

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
                window.history.replaceState(null, null, window.location.pathname);
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

    if (!token) {
        return <LoginScreen />;
    }

    return (
        <AppContext.Provider value={{ token, view, setView, selectedPlaylistId, setSelectedPlaylistId, player, isPlayerReady, currentTrack, isPaused, logout, deviceId, position, libraryVersion, setLibraryVersion, profile, setProfile, setPlaylistToEdit, setPlaylistToDelete }}>
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
    const { data: playlists, loading: playlistsLoading } = useSpotifyApi(`/me/playlists?limit=50&v=${libraryVersion}`);
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
// A custom hook to simplify making authenticated requests to the Spotify API.
const useSpotifyApi = (url) => {
    const { token, logout } = useContext(AppContext);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!token || !url) {
                setLoading(false);
                return;
            };
            try {
                setLoading(true);
                // Simple cache-busting by adding a timestamp.
                const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
                const response = await fetch(`https://api.spotify.com/v1${cacheBustedUrl}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    }
                });
                if (response.status === 401) { // If token is expired or invalid
                    logout();
                    return;
                }
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                setData(result);
            } catch (e) {
                setError(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [token, url, logout]);

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
    const { data: playlist, loading } = useSpotifyApi(`/playlists/${playlistId}`);
    const { token, deviceId, currentTrack, isPaused, setView, setSelectedPlaylistId } = useContext(AppContext);
    const [error, setError] = useState(null);

    const playTrack = async (trackUri) => {
        if (!deviceId) {
            setError("No active player found. Please open Spotify on a device and start playing a song.");
            return;
        }
        setError(null);
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
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
                </div>
            </header>
            
            {error && <div className="bg-red-500 text-white p-3 rounded-md mb-4">{error}</div>}
            
            <div>
                {playlist.tracks?.items?.length > 0 ? (
                    playlist.tracks.items.map(({ track }, index) => {
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
    const { token, setLibraryVersion, profile } = useContext(AppContext);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [createdPlaylist, setCreatedPlaylist] = useState(null);
    const [isWqxrLoading, setIsWqxrLoading] = useState(false);
    const [wqxrProgress, setWqxrProgress] = useState(0); // New state for progress
    const [isCustomLoading, setIsCustomLoading] = useState(false);
    // New states for Top Tracks Playlist
    const [isTopTracksLoading, setIsTopTracksLoading] = useState(false);
    const [topTracksProgress, setTopTracksProgress] = useState(0); 
    // New states for All Songs Playlist
    const [isAllSongsLoading, setIsAllSongsLoading] = useState(false);
    const [allSongsProgress, setAllSongsProgress] = useState(0);

    // State for Custom Playlist
    const [customPlaylistName, setCustomPlaylistName] = useState('');
    const [aiPrompt, setAiPrompt] = useState("");

    const getYesterdayDateParts = () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const year = yesterday.getFullYear();
        const month = yesterday.toLocaleString('default', { month: 'short' }).toLowerCase();
        const day = String(yesterday.getDate()).padStart(2, '0');
        return { year, month, day };
    };

    const { year: yesterdayYear, month: yesterdayMonth, day: yesterdayDay } = getYesterdayDateParts();

    const handleCreateWQXRPlaylist = async () => {
        if(!profile) {
            setError('Could not get user profile. Please try again.');
            return;
        }
        setIsWqxrLoading(true);
        setError('');
        setCreatedPlaylist(null);
        setWqxrProgress(0);
        setStatus('Requesting playlist from proxy server...');

        try {
            const { year, month, day } = getYesterdayDateParts();
            // NOTE: This fetch requires a local proxy to bypass CORS.
            const proxyResponse = await fetch(`http://localhost:3001/wqxr-playlist?year=${year}&month=${month}&day=${day}`);
            
            if (!proxyResponse.ok) throw new Error('Failed to fetch data from proxy server. Make sure it is running.');
    
            const data = await proxyResponse.json();
            const wqxrTracks = data.tracks;
    
            if (!wqxrTracks || wqxrTracks.length === 0) throw new Error('Could not parse any tracks from the WQXR playlist.');
            
            setStatus(`Found ${wqxrTracks.length} tracks from WQXR. Searching on Spotify...`);
            
            const trackUris = [];
            for (const [index, track] of wqxrTracks.entries()) {
                const query = encodeURIComponent(`track:${track.title} artist:${track.composer}`);
                const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const searchData = await response.json();
                if (searchData.tracks.items.length > 0) {
                    trackUris.push(searchData.tracks.items[0].uri);
                }
                // Update progress after each track is processed
                const progress = ((index + 1) / wqxrTracks.length) * 100;
                setWqxrProgress(progress);
            }
    
            if (trackUris.length === 0) throw new Error('Could not find any of the WQXR tracks on Spotify.');
            
            setStatus('Creating new WQXR playlist...');
            const playlistName = `WQXR Daily - ${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
                body: JSON.stringify({ name: playlistName, description: `A playlist of songs from WQXR on ${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}.`, public: false })
            });
            const newPlaylist = await playlistResponse.json();
    
            setStatus('Adding tracks to the new WQXR playlist...');
            await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ uris: trackUris })
            });
            
            setCreatedPlaylist(newPlaylist);
            setStatus('WQXR playlist created successfully!');
            setLibraryVersion(v => v + 1);
        
        } catch (e) {
            setError(e.message);
            setStatus('');
            console.error(e);
        } finally {
            setIsWqxrLoading(false);
            setWqxrProgress(0); // Reset progress on completion or error
        }
    };
    
    const resetCustomForm = () => {
        setCustomPlaylistName('');
        setAiPrompt('');
    };

    const handleCreateAiPlaylist = async () => {
        setError('');
        setStatus('');
        setCreatedPlaylist(null);
        if (!customPlaylistName.trim()) {
            setError('Playlist name cannot be empty.');
            return;
        }
        if (!aiPrompt.trim()) {
            setError('Please describe the kind of playlist you want.');
            return;
        }
        if(!profile) {
            setError('Could not get user profile. Please try again.');
            return;
        }

        setIsCustomLoading(true);
        setStatus('Asking AI for song ideas... This may take a moment.');

        try {
            const geminiPrompt = `Based on the following theme: "${aiPrompt}", generate a list of 90 suitable songs. Include a mix of popular and less common tracks if possible.`;
            let chatHistory = [{ role: "user", parts: [{ text: geminiPrompt }] }];
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
            
            // The API key is left as "" and will be handled by the environment.
            // This is the secure way to handle API calls from the client-side.
            const apiKey = "AIzaSyAsb7lrYNWBzSIUe5RUCOCMib20FzAX61M"; 
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const geminiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if(!geminiResponse.ok) {
                const errorBody = await geminiResponse.text();
                throw new Error(`AI request failed: ${geminiResponse.status}. ${errorBody}`);
            }

            const result = await geminiResponse.json();
            
            if (!result.candidates || result.candidates.length === 0) {
                 throw new Error("AI response was empty or invalid. Please try a different prompt.");
            }

            const songsText = result.candidates[0].content.parts[0].text;
            const aiSuggestions = JSON.parse(songsText).songs;

            if (!aiSuggestions || aiSuggestions.length === 0) {
                 throw new Error('The AI could not suggest any songs for this theme. Please try a different prompt.');
            }

            setStatus('Searching for suggested songs on Spotify...');
            const trackUris = [];
            // Use Promise.all for parallel search requests to speed up the process.
            await Promise.all(aiSuggestions.map(async (song) => {
                const query = encodeURIComponent(`track:${song.track} artist:${song.artist}`);
                const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const searchData = await searchResponse.json();
                if (searchData.tracks.items.length > 0) {
                    trackUris.push(searchData.tracks.items[0].uri);
                }
            }));

            if (trackUris.length === 0) {
                throw new Error('Could not find any of the AI-suggested songs on Spotify. The AI might be hallucinating!');
            }

            setStatus(`Creating playlist "${customPlaylistName}"...`);
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: customPlaylistName, description: `AI-generated playlist based on the prompt: "${aiPrompt}"`, public: false })
            });
            const newPlaylist = await playlistResponse.json();

            setStatus(`Adding ${trackUris.length} songs...`);
            // Spotify API can only handle 100 tracks at a time, so chunk if necessary (though we request 20).
            await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ uris: trackUris })
            });

            setCreatedPlaylist(newPlaylist);
            setStatus('AI-powered playlist created successfully!');
            setLibraryVersion(v => v + 1);
            resetCustomForm();

        } catch (e) {
            setError(`An error occurred: ${e.message}`);
            console.error(e);
            setStatus('');
        } finally {
            setIsCustomLoading(false);
        }
    };

    // New function for creating playlist from top tracks
    const handleCreateTopTracksPlaylist = async () => {
        if (!profile) {
            setError('Could not get user profile. Please try again.');
            return;
        }
        setIsTopTracksLoading(true);
        setError('');
        setCreatedPlaylist(null);
        setTopTracksProgress(0);
        setStatus('Fetching your top tracks from Spotify...');

        try {
            // Fetch top tracks (Spotify API supports limit up to 50 for top tracks)
            const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=50`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch top tracks: ${response.status}`);
            }
            const data = await response.json();
            const topTracks = data.items;

            if (!topTracks || topTracks.length === 0) {
                throw new Error('Could not find any top tracks. Listen to more music on Spotify!');
            }

            const trackUris = topTracks.map(track => track.uri);

            setStatus(`Found ${trackUris.length} top tracks. Creating playlist...`);
            const playlistName = `My Top Tracks - ${new Date().toLocaleDateString()}`;
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: playlistName, description: 'A playlist generated from your top Spotify tracks.', public: false })
            });
            const newPlaylist = await playlistResponse.json();

            setStatus('Adding tracks to your new top tracks playlist...');
            // Spotify API can add up to 100 tracks at a time
            await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ uris: trackUris })
            });

            setCreatedPlaylist(newPlaylist);
            setStatus('Top tracks playlist created successfully!');
            setLibraryVersion(v => v + 1); // Trigger a refresh of the sidebar playlists
        } catch (e) {
            setError(e.message);
            setStatus('');
            console.error(e);
        } finally {
            setIsTopTracksLoading(false);
            setTopTracksProgress(0);
        }
    };

    // Function to create a playlist with all songs from all user's playlists
    const handleCreateAllSongsPlaylist = async () => {
        if (!profile) {
            setError('Could not get user profile. Please try again.');
            return;
        }
        setIsAllSongsLoading(true);
        setError('');
        setCreatedPlaylist(null);
        setAllSongsProgress(0);
        setStatus('Fetching all your playlists. This may take a while...');

        try {
            let allPlaylists = [];
            // Start with the full API URL for playlists
            let nextPlaylistsUrl = 'https://api.spotify.com/v1/me/playlists?limit=50'; 

            while (nextPlaylistsUrl) {
                const response = await fetch(nextPlaylistsUrl, { // Use the full URL directly
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!response.ok) {
                    throw new Error(`Failed to fetch playlists: ${response.status}`);
                }
                const data = await response.json();
                allPlaylists = allPlaylists.concat(data.items);
                nextPlaylistsUrl = data.next; // Assign the full URL for the next page
            }

            if (allPlaylists.length === 0) {
                throw new Error('You have no playlists in your Spotify library.');
            }
            
            setStatus(`Found ${allPlaylists.length} playlists. Fetching tracks from each playlist...`);

            const uniqueTrackUris = new Set();
            let processedPlaylistsCount = 0;

            for (const playlist of allPlaylists) {
                // Start with the full API URL for playlist tracks
                let nextTracksUrl = `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`;
                while (nextTracksUrl) {
                    const response = await fetch(nextTracksUrl, { // Use the full URL directly
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!response.ok) {
                        console.warn(`Failed to fetch tracks for playlist "${playlist.name}" (${playlist.id}): ${response.status}`);
                        break; // Skip to next playlist if unable to fetch tracks
                    }
                    const data = await response.json();
                    if (data.items) { // Ensure data.items exists before iterating
                        data.items.forEach(item => {
                            // Ensure track and track.uri exist and are valid before adding
                            if (item.track && typeof item.track.uri === 'string' && item.track.uri.startsWith('spotify:track:')) {
                                uniqueTrackUris.add(item.track.uri);
                            } else {
                                console.warn(`Skipping invalid track URI from playlist "${playlist.name}":`, item.track);
                            }
                        });
                    }
                    nextTracksUrl = data.next; // Assign the full URL for the next page
                }
                processedPlaylistsCount++;
                setAllSongsProgress((processedPlaylistsCount / allPlaylists.length) * 100);
                setStatus(`Processed ${processedPlaylistsCount} of ${allPlaylists.length} playlists. Found ${uniqueTrackUris.size} unique songs.`);
            }

            const trackUrisArray = Array.from(uniqueTrackUris);

            if (trackUrisArray.length === 0) {
                throw new Error('Could not find any unique songs across your playlists.');
            }

            setStatus(`Found ${trackUrisArray.length} unique songs. Creating new playlist...`);
            const playlistName = `All My Playlists Songs - ${new Date().toLocaleDateString()}`;
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${profile.id}/playlists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: playlistName, description: 'A playlist containing all unique songs from your Spotify playlists.', public: false })
            });
            const newPlaylist = await playlistResponse.json();

            setStatus(`Adding ${trackUrisArray.length} songs to the new playlist. This may take some time for large libraries.`);

            // Spotify API allows adding up to 100 tracks per request
            const chunkSize = 100;
            for (let i = 0; i < trackUrisArray.length; i += chunkSize) {
                const chunk = trackUrisArray.slice(i, i + chunkSize);
                console.log(`Sending chunk ${Math.floor(i / chunkSize) + 1} with ${chunk.length} URIs:`, chunk); // Log the chunk
                const addTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${newPlaylist.id}/tracks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ uris: chunk })
                });

                if (!addTracksResponse.ok) {
                    const errorBody = await addTracksResponse.json();
                    console.error("Error adding tracks chunk:", errorBody); // Log the specific error from Spotify
                    throw new Error(`Failed to add tracks to playlist: ${addTracksResponse.status} - ${errorBody.error?.message || 'Unknown error'}`);
                }
                setAllSongsProgress( ( (i + chunk.length) / trackUrisArray.length) * 100);
            }

            setCreatedPlaylist(newPlaylist);
            setStatus('All My Playlists Songs playlist created successfully!');
            setLibraryVersion(v => v + 1); // Trigger a refresh of the sidebar playlists
        } catch (e) {
            setError(e.message);
            setStatus('');
            console.error("Error creating all songs from playlists:", e);
        } finally {
            setIsAllSongsLoading(false);
            setAllSongsProgress(0);
        }
    };


    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold mb-4">Playlist Creator</h1>
            
            {error && <div className="p-3 bg-red-800 text-white rounded-md mb-4">{error}</div>}
            {status && !error && <div className="p-3 bg-blue-800 text-white rounded-md mb-4">{status}</div>}
            
             <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">WQXR Daily Playlist</h2>
                <p className="text-gray-400 mb-4">
                    Create a new playlist based on the music played yesterday ({yesterdayDay}-{yesterdayMonth}-{yesterdayYear}) on WQXR.
                </p>
                <button 
                    onClick={handleCreateWQXRPlaylist} 
                    disabled={isWqxrLoading || isCustomLoading || isTopTracksLoading || isAllSongsLoading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                >
                    {isWqxrLoading ? 'Creating...' : "Create Yesterday's Playlist"}
                </button>
                {isWqxrLoading && (
                    <div className="mt-4">
                        <div className="w-full bg-gray-600 rounded-full h-2.5">
                            <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${wqxrProgress}%` }}></div>
                        </div>
                        <p className="text-center text-sm text-gray-300 mt-1">{Math.round(wqxrProgress)}%</p>
                    </div>
                )}
            </div>

            {/* New section for Top Tracks Playlist */}
            <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">Playlist from Your Top Tracks</h2>
                <p className="text-gray-400 mb-4">
                    Instantly create a new playlist composed of your 50 most listened to tracks on Spotify.
                </p>
                <button 
                    onClick={handleCreateTopTracksPlaylist} 
                    disabled={isWqxrLoading || isCustomLoading || isTopTracksLoading || isAllSongsLoading}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                >
                    {isTopTracksLoading ? 'Creating...' : "Create Top Tracks Playlist"}
                </button>
                {isTopTracksLoading && (
                    <div className="mt-4">
                        <div className="w-full bg-gray-600 rounded-full h-2.5">
                            <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: `${topTracksProgress}%` }}></div>
                        </div>
                        <p className="text-center text-sm text-gray-300 mt-1">{Math.round(topTracksProgress)}%</p>
                    </div>
                )}
            </div>

            {/* New section for All Songs from Playlists */}
            <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">Playlist with All Unique Songs from Your Playlists</h2>
                <p className="text-gray-400 mb-4">
                    Create a single playlist containing every unique song from all your existing Spotify playlists.
                </p>
                <button 
                    onClick={handleCreateAllSongsPlaylist} 
                    disabled={isWqxrLoading || isCustomLoading || isTopTracksLoading || isAllSongsLoading}
                    className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                >
                    {isAllSongsLoading ? 'Creating...' : "Create All My Playlists Songs"}
                </button>
                {isAllSongsLoading && (
                    <div className="mt-4">
                        <div className="w-full bg-gray-600 rounded-full h-2.5">
                            <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${allSongsProgress}%` }}></div>
                        </div>
                        <p className="text-center text-sm text-gray-300 mt-1">{Math.round(allSongsProgress)}%</p>
                    </div>
                )}
            </div>

            <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-2">AI-Powered Playlist Creator</h2>
                <p className="text-gray-400 mb-4">
                    Describe the kind of playlist you want, and let AI build it for you.
                </p>
                <div className="space-y-4">
                     <div>
                         <label className="block mb-1 text-sm font-medium text-gray-300">Playlist Name</label>
                         <input type="text" value={customPlaylistName} onChange={e => setCustomPlaylistName(e.target.value)} placeholder="My Awesome Mix" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                     </div>
                     <div>
                         <label className="block mb-1 text-sm font-medium text-gray-300">Describe your playlist</label>
                         <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="e.g., an upbeat roadtrip playlist with 90s alternative rock" rows="3" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                     </div>
                </div>
                <button 
                    onClick={handleCreateAiPlaylist} 
                    disabled={isWqxrLoading || isCustomLoading || isTopTracksLoading || isAllSongsLoading}
                    className="mt-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-2 px-6 rounded-full"
                >
                    {isCustomLoading ? 'Creating...' : "Create AI Playlist"}
                </button>
            </div>
        </div>
    );
}

// --- NEW --- SearchView Component
// A new component to handle search functionality.
function SearchView() {
    const { token } = useContext(AppContext);
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
            const response = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery}&type=${type}&limit=10`, {
                   headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setResults(data);
            setLoading(false);
        }, 500); // 500ms delay

        return () => clearTimeout(searchTimer);
    }, [query, token]);

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

// --- Search Result Display Components ---
function TrackResults({ tracks }) {
    const { playTrack } = usePlayerActions(); // Helper hook for player actions
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

// Custom hook to abstract player logic
function usePlayerActions() {
    const { token, deviceId } = useContext(AppContext);
    const playTrack = (trackUri) => {
        if (!deviceId) {
            // In a real app, you'd show a non-blocking notification here.
            console.error("No active player found.");
            return;
        }
        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uris: [trackUri] })
        });
    }
    return { playTrack };
}


function EditPlaylistModal({ playlist, onClose }) {
    const { token, setLibraryVersion } = useContext(AppContext);
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError("");
        try {
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name, description })
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Failed to update playlist.');
            }
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
    const { token, setLibraryVersion, setView, setSelectedPlaylistId } = useContext(AppContext);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState("");
    
    const handleDelete = async () => {
        setIsDeleting(true);
        setError("");
        try {
            // Unfollowing a playlist is the standard way to "delete" it from a user's library
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/followers`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Failed to delete playlist.');
            }
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
