const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = 3001; // We'll run this on a different port than the React app

// Use the cors middleware to allow requests from our React app
app.use(cors());

// Define the proxy endpoint
app.get('/wqxr-playlist', async (req, res) => {
  // Get date parts from the query parameters sent by the React app
  const { year, month, day } = req.query;

  if (!year || !month || !day) {
    return res.status(400).json({ error: 'Missing required date parameters (year, month, day).' });
  }

  const url = `https://wqxr-legacy.prod.nypr.digital/playlist-daily/${year}/${month}/${day}/?scheduleStation=q2`;

  try {
    // Use axios to fetch the HTML content from the WQXR playlist page
    const { data } = await axios.get(url);

    // Load the HTML into Cheerio to parse it
    const $ = cheerio.load(data);

    const tracks = [];
    
    // Find each song entry on the page. This selector is specific to the WQXR page structure.
    // We look for list items with the class 'playlist-item'
    $('.playlist-item').each((index, element) => {
      // For each song, find the title and the composer
      const title = $(element).find('.playlist-item-title').text().trim();
      const composer = $(element).find('.playlist-item-composer a').text().trim();

      if (title && composer) {
        tracks.push({ title, composer });
      }
    });

    // Send the extracted track data back to our React app as JSON
    res.json({ tracks });

  } catch (error) {
    console.error('Error fetching or parsing playlist data:', error.message);
    res.status(500).json({ error: 'Failed to fetch playlist data from WQXR.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
