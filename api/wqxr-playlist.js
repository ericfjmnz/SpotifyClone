const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  const { year, month, day } = req.query;

  if (!year || !month || !day) {
    return res
      .status(400)
      .json({ error: 'Missing required date parameters (year, month, day).' });
  }

  const url = `https://wqxr-legacy.prod.nypr.digital/playlist-daily/${year}/${month}/${day}/?scheduleStation=q2`;

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const tracks = [];

    $('.playlist-item').each((index, element) => {
      const title = $(element).find('.playlist-item__title').text().trim();
      const composer = $(element)
        .find('.piece-info')
        .find('ul')
        .children('li')
        .find('a')
        .last()
        .text()
        .trim();

      if (title && composer) {
        tracks.push({ title, composer });
      }
    });

    // Cache for an hour at the edge — playlists for past dates don't change,
    // and even today's won't change minute-to-minute.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json({ tracks });
  } catch (error) {
    console.error('Error fetching or parsing playlist data:', error.message);
    res.status(500).json({ error: 'Failed to fetch playlist data from WQXR.' });
  }
};
