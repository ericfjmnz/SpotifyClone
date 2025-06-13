import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

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
    "playlist-read-private",
    "playlist-read-collaborative",
    // Scopes required for Web Playback SDK
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state"
].join(" ");


// --- React Context for State Management ---
const AppContext = createContext();

// --- PKCE Helper Functions ---

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

// --- Login Screen Component ---
function LoginScreen() {
    const [clientId, setClientId] = useState("");
    const [loginError, setLoginError] = useState("");
    const [copied, setCopied] = useState(false);
    
    useEffect(() => {
        const storedClientId = window.localStorage.getItem("spotify_client_id");
        if (storedClientId) {
            setClientId(storedClientId);
        }

        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        if (error) {
            setLoginError(`Spotify returned an error: "${error}". Please ensure your Redirect URI is correctly set in your dashboard.`);
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
    
    const copyToClipboard = () => {
        const textToCopy = REDIRECT_URI;
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white p-4">
            <div className="text-center bg-gray-800 p-8 rounded-lg shadow-2xl max-w-2xl w-full">
                <h1 className="text-4xl font-bold mb-2">Connect to Spotify</h1>
                <p className="text-gray-400 mb-6">First, you need to configure your app in the Spotify Developer Dashboard.</p>
                
                <div className="bg-gray-900 p-4 rounded-lg mb-6 text-left">
                    <label className="text-sm font-semibold text-gray-300">Your Redirect URI:</label>
                    <div className="flex items-center justify-between mt-2">
                        <code className="text-green-400 bg-black p-2 rounded-md text-sm break-all">{REDIRECT_URI}</code>
                        <button onClick={copyToClipboard} className={`ml-4 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${copied ? 'bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Copy this exact URI and paste it into the "Redirect URIs" field in your Spotify app's settings.</p>
                </div>
                
                <p className="text-gray-400 mb-4">Once configured, enter your Client ID below to log in.</p>

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
export default function App() {
    const [token, setToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('home'); 
    const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
    const [player, setPlayer] = useState(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPaused, setIsPaused] = useState(true);
    const [sdkLoaded, setSdkLoaded] = useState(false);

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

    // Effect for loading external Spotify SDK and Tailwind CSS
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

    // Effect for handling authentication token
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

                if (!result.ok) {
                    throw new Error(`HTTP error! status: ${result.status}`);
                }

                const { access_token } = await result.json();
                window.localStorage.setItem("spotify_token", access_token);
                setToken(access_token);
                window.history.replaceState(null, null, window.location.pathname);
            } catch (error) {
                console.error("Error fetching token:", error);
                window.localStorage.removeItem("spotify_token");
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
    }, []);

    // Effect for initializing the Spotify Player
    useEffect(() => {
        if (token && sdkLoaded) {
            const playerInstance = new window.Spotify.Player({
                name: 'React Spotify Clone',
                getOAuthToken: cb => { cb(token); },
                volume: 0.5,
                getRobustnessLevel: () => Promise.resolve('low'),
            });

            setPlayer(playerInstance);

            playerInstance.addListener('ready', ({ device_id }) => {
                setIsPlayerReady(true);
            });
            playerInstance.addListener('not_ready', ({ device_id }) => {});
            
            playerInstance.addListener('player_state_changed', ( state => {
                if (!state) {
                    return;
                }
                setCurrentTrack(state.track_window.current_track);
                setIsPaused(state.paused);
            }));

            playerInstance.connect();

            return () => {
                playerInstance.disconnect();
            };
        }
    }, [token, sdkLoaded]);
    
    if (isLoading && !token) {
        return <div className="h-screen w-full flex items-center justify-center bg-black text-white"><p>Loading...</p></div>;
    }

    if (!token) {
        return <LoginScreen />;
    }

    return (
        <AppContext.Provider value={{ token, view, setView, selectedPlaylistId, setSelectedPlaylistId, player, isPlayerReady, currentTrack, isPaused, logout }}>
            <div className="h-screen w-full flex flex-col bg-black text-white font-sans">
                <div className="flex flex-1 overflow-y-hidden">
                    <Sidebar />
                    <MainContent />
                    <RightSidebar />
                </div>
                <PlayerBar />
            </div>
        </AppContext.Provider>
    );
}

// --- Layout Components ---

function Sidebar() {
    const { view, setView, selectedPlaylistId, setSelectedPlaylistId, logout } = useContext(AppContext);
    const { data: playlists, loading: playlistsLoading } = useSpotifyApi('/me/playlists');
    
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
        setSelectedPlaylistId(playlistId);
        setView('playlist');
    };

    return (
        <nav className="w-64 bg-black p-2 flex-shrink-0 flex-col hidden sm:flex">
            <div className="bg-[#121212] rounded-lg p-2">
                 <ul className="space-y-2">
                    <NavItem label="Home" targetView="home" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16"><path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L8.354 1.146zM2.5 14V7.707l5.5-5.5 5.5 5.5V14H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4H2.5z"/></svg>} />
                    <NavItem label="Search" targetView="search" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>} />
                </ul>
            </div>
            <div className="bg-[#121212] rounded-lg p-2 mt-2 flex-1 overflow-y-auto">
                 <h2 className="p-4 text-base font-semibold text-gray-300">Your Library</h2>
                 {playlistsLoading ? (
                     <p className="p-4 text-gray-400">Loading playlists...</p>
                 ) : (
                    <ul className="space-y-1">
                        {playlists?.items.map(playlist => (
                            <li key={playlist.id} onClick={() => handlePlaylistClick(playlist.id)} className={`text-gray-400 hover:text-white p-2 rounded-md cursor-pointer truncate text-sm ${selectedPlaylistId === playlist.id ? 'bg-gray-800 !text-white' : ''}`}>
                                {playlist.name}
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
                {view === 'search' && <div className="text-center"><h1 className="text-3xl font-bold">Search</h1><p className="text-gray-400">Search functionality coming soon!</p></div>}
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

function PlayerBar() {
    const { player, currentTrack, isPaused, isPlayerReady } = useContext(AppContext);

    if (!player) return <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-center"><p className="text-gray-400">Connecting to Spotify...</p></footer>;
    
    if (!isPlayerReady) return <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-center"><p className="text-gray-400">Player not ready. Open a Spotify app on your computer or phone.</p></footer>;
    
    if (!currentTrack) return <footer className="h-24 bg-black border-t border-gray-800 flex items-center justify-center"><p className="text-gray-400">Select a song to play.</p></footer>;

    const togglePlay = () => {
        player.togglePlay();
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
                    <button className="text-gray-400 hover:text-white">«</button>
                    <button onClick={togglePlay} className="p-2 bg-white text-black rounded-full hover:scale-105">
                        {isPaused ? 
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> :
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        }
                    </button>
                    <button className="text-gray-400 hover:text-white">»</button>
                 </div>
                 <div className="w-full h-1 bg-gray-700 rounded-full mt-1">
                    <div className="w-1/2 h-full bg-white rounded-full"></div>
                 </div>
            </div>
            <div className="w-1/4 flex justify-end items-center gap-2">
                <p className="text-xs">Volume</p>
            </div>
        </footer>
    );
}


// --- API Fetch Hook ---
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
                const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
                const response = await fetch(`https://api.spotify.com/v1${cacheBustedUrl}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    }
                });
                if (response.status === 401) {
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

function PlaylistCard({ imageUrl, title, subtitle, isArtist = false }) {
    const imageClasses = isArtist ? "rounded-full shadow-lg" : "rounded-md shadow-lg";

    return (
        <div className="bg-[#181818] rounded-lg hover:bg-[#282828] transition-colors duration-300 group cursor-pointer p-4">
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
    const { data: profile } = useSpotifyApi('/me');
    const [featuredPlaylistsUrl, setFeaturedPlaylistsUrl] = useState(null);
    
    useEffect(() => {
        if(profile?.country) {
            setFeaturedPlaylistsUrl(`/browse/featured-playlists?country=${profile.country}&limit=5`);
        }
    }, [profile]);
    
    const { data: featuredPlaylistsData, loading: playlistsLoading, error: playlistsError } = useSpotifyApi(featuredPlaylistsUrl);
    const { data: topArtists, loading: artistsLoading, error: artistsError } = useSpotifyApi('/me/top/artists?limit=5');
    const { data: recent, loading: recentLoading, error: recentError } = useSpotifyApi('/me/player/recently-played?limit=6');

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
            
            {featuredPlaylistsUrl && 
                <ContentSection title={featuredPlaylistsData?.message || "Featured Playlists"} loading={playlistsLoading} error={playlistsError}>
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {featuredPlaylistsData?.playlists.items.map(playlist => (
                           <PlaylistCard 
                                key={playlist.id} 
                                imageUrl={playlist.images[0]?.url}
                                title={playlist.name}
                                subtitle={playlist.description.replace(/<[^>]*>?/gm, '')}
                            />
                        ))}
                     </div>
                </ContentSection>
            }

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
    const { token } = useContext(AppContext);

    const playTrack = (trackUri) => {
        fetch(`https://api.spotify.com/v1/me/player/play`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ uris: [trackUri] })
        });
    };

    if (loading) return <div className="text-center p-10">Loading playlist...</div>;
    if (!playlist) return <div className="text-center p-10">Playlist not found.</div>;

    return (
        <div className="text-white">
            <header className="flex items-end gap-6 mb-8">
                <img src={playlist.images[0]?.url} alt="" className="w-48 h-48 shadow-2xl"/>
                <div>
                    <p className="text-sm font-bold">Playlist</p>
                    <h1 className="text-5xl font-extrabold">{playlist.name}</h1>
                    <p className="text-gray-300 mt-2">{playlist.description.replace(/<[^>]*>?/gm, '')}</p>
                </div>
            </header>
            
            <div>
                {playlist.tracks.items.map(({ track }, index) => {
                    if(!track) return null; // Add guard for null tracks
                    return (
                        <div key={track.id + index} className="grid grid-cols-[auto,1fr,auto] items-center gap-4 p-2 rounded-md hover:bg-white/10 group">
                            <div className="text-gray-400 w-8 text-center">{index + 1}</div>
                            <div className="flex items-center gap-4">
                                <img src={track.album.images[2]?.url} alt="" className="w-10 h-10"/>
                                <div>
                                    <p className="font-semibold text-white">{track.name}</p>
                                    <p className="text-sm text-gray-400">{track.artists.map(a => a.name).join(', ')}</p>
                                </div>
                            </div>
                            <button onClick={() => playTrack(track.uri)} className="text-white opacity-0 group-hover:opacity-100">
                                 <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PlaylistCurator() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-4">Playlist Curator</h1>
            <p className="text-gray-400 mb-6">This tool will help you build playlists based on specific criteria like BPM, genre, and release year.</p>
            <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-4">Filters</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">Genre</label>
                        <input type="text" placeholder="e.g., electronic, rock" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                    </div>
                     <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">BPM (Beats Per Minute)</label>
                        <input type="range" min="0" max="220" className="w-full" />
                    </div>
                     <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">Year</label>
                        <input type="number" placeholder="e.g., 1995" className="w-full p-2 bg-gray-700 rounded-md border-gray-600" />
                    </div>
                </div>
                <div className="mt-6 text-center">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-full">Find Songs & Create Playlist</button>
                </div>
            </div>
            <div className="mt-8">
                 <h3 className="text-lg font-semibold mb-4">Results will appear here...</h3>
                 {/* Placeholder for results */}
            </div>
        </div>
    );
}







