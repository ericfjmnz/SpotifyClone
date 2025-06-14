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

  const url = 'https://wqxr-legacy.prod.nypr.digital/playlist-daily/2025/jun/12/?scheduleStation=q2';
//  console.log(url);
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
      // **FIX**: Use .text() and .trim() to extract the string content from the HTML elements
      const title = $(element).find('.playlist-item__title').text().trim();
      const composer = $(element).find('.playlist-item__musicians').text().trim();

      if (title && composer) {
        tracks.push({ title, composer });
      }
    });
    console.table(tracks);
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



// // A hardcoded URL with a known-good playlist for consistent testing.
// // You can change the date in this URL to test different days.
// const TEST_URL = 'https://wqxr-legacy.prod.nypr.digital/playlist-daily/2025/jun/12/?scheduleStation=q2';

// async function testScraper() {
//   console.log(`Fetching data from: ${TEST_URL}`);

//   try {
//     // 1. Fetch the HTML from the target page
//     const { data } = await axios.get(TEST_URL);

//     // 2. Load the HTML into Cheerio for parsing
//     const $ = cheerio.load(data);

//     const tracks = [];
    
//     // 3. Use Cheerio's jQuery-like selectors to find the elements
//     // This part should be identical to the logic in your server.js
//     $('.playlist-item').each((index, element) => {
      
//       // **Example**: Log the raw HTML of the current element to the console
//       // This is useful for inspecting the structure and debugging selectors.
//       console.log(`--- HTML for item ${index + 1} ---`);
//     //   console.log($(element).html());
//       console.log('------------------------');

//       const title = $(element).find('.playlist-item__title').text().trim();
//       const composer = $(element).find('.playlist-item__composer').text().trim();
//     //   console.log(composer);

//       if (title && composer) {
//         tracks.push({ title, composer });
//       }
//     });

//     // 4. Print the final extracted data to the console
//     if (tracks.length > 0) {
//       console.log('Successfully scraped the following tracks:');
//       console.table(tracks); // .table provides a nice, clean output format
//     } else {
//       console.log('No tracks found. Check the HTML structure and selectors.');
//     }

//   } catch (error) {
//     console.error('An error occurred during testing:', error.message);
//   }
// }

// // Run the test function
// testScraper();