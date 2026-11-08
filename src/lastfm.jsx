// src/lastfm.jsx
export async function getTrackGenresFromLastFm(trackName, artistName) {
    const apiKey = import.meta.env.VITE_LASTFM_API_KEY;
    
    // Last.fm requires URL encoded parameters
    const track = encodeURIComponent(trackName);
    const artist = encodeURIComponent(artistName);
    
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${artist}&track=${track}&api_key=${apiKey}&format=json`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Last.fm API error: ${response.status}`);
        
        const data = await response.json();
        
        // Check if the track has tags
        if (data.toptags && data.toptags.tag) {
            // Map the tags and filter out low-count or garbage tags
            // Last.fm tags are user-generated, so taking the top 3-5 is usually best
            return data.toptags.tag
                .slice(0, 5)
                .map(t => t.name.toLowerCase());
        }
        return [];
    } catch (error) {
        console.error("Failed to fetch genres from Last.fm:", error);
        return [];
    }
}