import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// --- Spotify API Configuration ---
const REDIRECT_URI = window.location.origin; // Using a static URI as requested
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const RESPONSE_TYPE = "token";
const SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "playlist-modify-public",
    "playlist-modify-private",
    "playlist-read-private",
    "user-top-read",
].join(" ");


// --- React Context for State Management ---
const AppContext = createContext();

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
    }, []);

    const handleLogin = (e) => {
        e.preventDefault();
        if (clientId) {
            setLoginError("");
            window.localStorage.setItem("spotify_client_id", clientId);
            const loginUrl = `${AUTH_ENDPOINT}?client_id=${clientId}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}&response_type=${RESPONSE_TYPE}&show_dialog=true`;
            window.location.href = loginUrl;
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
                        <code className="text-green-400 bg-black p-2 rounded-md text-sm">{REDIRECT_URI}</code>
                        <button onClick={copyToClipboard} className={`ml-4 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${copied ? 'bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Copy this URI and paste it into the "Redirect URIs" field in your Spotify app's settings.</p>
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
                    {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
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
    const [token, setToken] = useState("");
    const [experienceMode, setExperienceMode] = useState('normal'); // Simplified state
    const [view, setView] = useState('home'); // home, curator, search, authorized

    // Spotify Token Handler
    useEffect(() => {
        const hash = window.location.hash;
        let localToken = window.localStorage.getItem("spotify_token");
        let isNewLogin = false;

        if (!localToken && hash) {
            const parsedToken = hash.substring(1).split("&").find(elem => elem.startsWith("access_token"))?.split("=")[1];
            const spotifyError = new URLSearchParams(hash.substring(1)).get('error');

            if (parsedToken) {
                window.location.hash = "";
                window.localStorage.setItem("spotify_token", parsedToken);
                localToken = parsedToken; 
                isNewLogin = true;
            } else if (spotifyError) {
                console.error("Spotify login error:", spotifyError);
                window.location.hash = "";
            }
        }
        setToken(localToken);

        if (isNewLogin) {
            setView('authorized');
        }
    }, []);

    const logout = () => {
        setToken("");
        window.localStorage.removeItem("spotify_token");
        window.localStorage.removeItem("spotify_client_id");
        window.location.hash = "";
        setView('home');
    };
    
    if (!token) {
        return <LoginScreen />;
    }

    return (
        <AppContext.Provider value={{ token, experienceMode, setExperienceMode, view, setView }}>
            {view === 'authorized' ? (
                <WelcomePage />
            ) : (
                <div className="h-screen w-full flex flex-col bg-black text-white">
                    <div className="flex flex-1 overflow-hidden">
                        <Sidebar logout={logout} />
                        <MainContent />
                    </div>
                </div>
            )}
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
                <NavItem label="Search" targetView="search" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
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
        <main className="flex-1 bg-gray-900 p-8 overflow-y-auto">
            {view === 'home' && <HomePage />}
            {view === 'curator' && <PlaylistCurator />}
            {view === 'search' && <div className="text-center"><h1 className="text-3xl font-bold">Search</h1><p className="text-gray-400">Search functionality coming soon!</p></div>}
        </main>
    );
}

// --- View Components ---

function WelcomePage() {
    const { setView } = useContext(AppContext);

    return (
        <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white p-4">
            <div className="text-center bg-gray-800 p-12 rounded-lg shadow-2xl animate-fade-in-up">
                <h1 className="text-4xl font-bold mb-4">Authorization Successful!</h1>
                <p className="text-gray-300 mb-8">You've successfully connected your Spotify account.</p>
                <button 
                    onClick={() => setView('home')} 
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-full transition duration-300 transform hover:scale-105"
                >
                    Enter the App
                </button>
            </div>
        </div>
    );
}

function HomePage() {
    const { experienceMode, setExperienceMode } = useContext(AppContext);

    return (
        <div>
            <h1 className="text-4xl font-bold mb-4">Welcome Back!</h1>
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-3">Choose Your Experience Mode:</h2>
                <div className="flex space-x-4">
                    <button onClick={() => setExperienceMode('beginner')} className={`px-4 py-2 rounded-md ${experienceMode === 'beginner' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Beginner</button>
                    <button onClick={() => setExperienceMode('normal')} className={`px-4 py-2 rounded-md ${experienceMode === 'normal' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Normal</button>
                    <button onClick={() => setExperienceMode('expert')} className={`px-4 py-2 rounded-md ${experienceMode === 'expert' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}>Expert</button>
                </div>
            </div>
            
            {/* Conditional rendering based on experience mode */}
            {experienceMode === 'beginner' && <BeginnerView />}
            {experienceMode === 'normal' && <NormalView />}
            {experienceMode === 'expert' && <ExpertView />}
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


// --- Experience Mode Views (Placeholders) ---

function BeginnerView() {
    return <div className="p-6 bg-gray-800 rounded-lg"><h3 className="text-2xl font-bold text-green-400">Beginner Mode</h3><p className="text-gray-300 mt-2">Simplified view focused on discovery. Top recommendations and featured playlists will be shown here.</p></div>;
}

function NormalView() {
    return <div className="p-6 bg-gray-800 rounded-lg"><h3 className="text-2xl font-bold text-blue-400">Normal Mode</h3><p className="text-gray-300 mt-2">A balanced dashboard with your recent activity, new releases, and personalized suggestions.</p></div>;
}

function ExpertView() {
    return <div className="p-6 bg-gray-800 rounded-lg"><h3 className="text-2xl font-bold text-red-400">Expert Mode</h3><p className="text-gray-300 mt-2">A data-dense view for power users. It will feature detailed listening stats, quick access to tools, and advanced sorting/filtering options for your library.</p></div>;
}

