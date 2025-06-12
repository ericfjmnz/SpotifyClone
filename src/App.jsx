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
    const [experienceMode, setExperienceMode] = useState('normal'); 
    const [view, setView] = useState('home'); 

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
                window.localStorage.removeItem("code_verifier");
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

    const logout = () => {
        setToken(null);
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("spotify_client_id");
        window.localStorage.removeItem("code_verifier");
        window.history.replaceState(null, null, window.location.pathname);
        setView('home');
    };
    
    if (isLoading) {
        return <div className="h-screen w-full flex items-center justify-center bg-black text-white"><p>Loading...</p></div>;
    }

    if (!token) {
        return <LoginScreen />;
    }

    return (
        <AppContext.Provider value={{ token, experienceMode, setExperienceMode, view, setView }}>
            <div className="h-screen w-full flex flex-col bg-black text-white">
                <div className="flex flex-1 overflow-hidden">
                    <Sidebar logout={logout} />
                    <MainContent />
                </div>
            </div>
        </AppContext.Provider>
    );
}

// --- Layout Components ---

function Sidebar({ logout }) {
    const { view, setView } = useContext(AppContext);
    
    const NavItem = ({ label, targetView, icon }) => (
         <li
            onClick={() => setView(targetView)}
            className={`flex items-center space-x-4 px-4 py-2 rounded-md cursor-pointer transition-colors duration-200 ${view === targetView ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
        >
            {icon}
            <span className="font-semibold">{label}</span>
        </li>
    );

    return (
        <nav className="w-64 bg-black p-4 flex flex-col space-y-4">
            <div className="text-2xl font-bold text-white mb-6">Spotify Hub</div>
            <ul className="space-y-2">
                <NavItem label="Home" targetView="home" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>} />
                <NavItem label="Playlist Curator" targetView="curator" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>}/>
                <NavItem label="Search" targetView="search" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
            </ul>
            <div className="flex-grow"></div>
            <button onClick={logout} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full transition duration-300">
                Logout
            </button>
        </nav>
    );
}

function MainContent() {
    const { view } = useContext(AppContext);
    
    return (
        <main className="flex-1 bg-gradient-to-b from-gray-800 to-black p-6 md:p-8 overflow-y-auto">
            {view === 'home' && <HomePage />}
            {view === 'curator' && <PlaylistCurator />}
            {view === 'search' && <div className="text-center"><h1 className="text-3xl font-bold">Search</h1><p className="text-gray-400">Search functionality coming soon!</p></div>}
        </main>
    );
}

// --- API Fetch Hook ---
const useSpotifyApi = (url) => {
    const { token } = useContext(AppContext);
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
                const response = await fetch(`https://api.spotify.com/v1${url}`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
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
    }, [token, url]);

    return { data, error, loading };
};


// --- View Components ---

function ContentSection({ title, children }) {
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

function PlaylistCard({ imageUrl, title, subtitle }) {
    return (
        <div className="bg-[#181818] p-4 rounded-lg hover:bg-[#282828] transition-colors duration-300 group cursor-pointer">
            <div className="relative mb-4">
                <img src={imageUrl || 'https://placehold.co/300x300/181818/FFFFFF?text=...'} alt={title} className="w-full h-auto rounded-md shadow-lg"/>
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
    const { data: profile, loading: profileLoading } = useSpotifyApi('/me');
    const { data: featuredPlaylistsData, loading: playlistsLoading } = useSpotifyApi('/browse/featured-playlists?limit=5');
    const { data: topArtists, loading: artistsLoading } = useSpotifyApi('/me/top/artists?limit=5');
    const { data: recent, loading: recentLoading } = useSpotifyApi('/me/player/recently-played?limit=6');

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
    };

    if (profileLoading || playlistsLoading || artistsLoading || recentLoading) {
        return <div className="text-white text-center p-10">Loading your space...</div>;
    }

    return (
        <div className="space-y-12">
            <h1 className="text-3xl font-bold">{getGreeting()}</h1>

             <section>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {recent && recent.items.map(({ track }, index) => (
                       <div key={`${track.id}-${index}`} className="bg-white/10 hover:bg-white/20 transition-colors duration-300 rounded-md flex items-center gap-4 group cursor-pointer">
                           <img src={track.album.images[0]?.url || 'https://placehold.co/80x80/181818/FFFFFF?text=...'} alt={track.name} className="w-20 h-20 rounded-l-md"/>
                           <p className="font-semibold text-white flex-1 pr-2">{track.name}</p>
                           <div className="mr-4 w-10 h-10 bg-green-500 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl hidden sm:flex">
                              <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                           </div>
                       </div> 
                    ))}
                </div>
            </section>

            <ContentSection title={featuredPlaylistsData?.message || "Featured Playlists"}>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {featuredPlaylistsData && featuredPlaylistsData.playlists.items.map(playlist => (
                       <PlaylistCard 
                            key={playlist.id} 
                            imageUrl={playlist.images[0]?.url}
                            title={playlist.name}
                            subtitle={playlist.description.replace(/<[^>]*>?/gm, '')} // Remove HTML from description
                        />
                    ))}
                </div>
            </ContentSection>

            <ContentSection title="Your Top Artists">
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {topArtists && topArtists.items.map(artist => (
                       <PlaylistCard 
                            key={artist.id} 
                            imageUrl={artist.images[0]?.url}
                            title={artist.name}
                            subtitle="Artist"
                        />
                    ))}
                </div>
            </ContentSection>
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


