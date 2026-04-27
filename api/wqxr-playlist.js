import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  const { year, month, day } = req.query;

  if (!year || !month || !day) {
    return res
      .status(400)
      .json({ error: 'Missing required date parameters (year, month, day).' });
  }

  const url = `https://wqxr-legacy.prod.nypr.digital/playlist-daily/${year}/${month}/${day}/?scheduleStation=q2`;

  try {
    const { data, status } = await axios.get(url, {
      timeout: 8000,
      validateStatus: (s) => s < 500, // Handle 4xx ourselves with a clear message.
    });

    if (status !== 200) {
      console.error(`WQXR returned non-200 status: ${status} for ${url}`);
      return res.status(502).json({
        error: 'WQXR returned an unexpected response.',
        upstreamStatus: status,
        upstreamUrl: url,
      });
    }

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

    if (tracks.length === 0) {
      console.warn(`WQXR page loaded but no tracks parsed for ${url}`);
      return res.status(502).json({
        error: 'WQXR page loaded but contained no tracks. The page layout may have changed.',
        upstreamUrl: url,
      });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.json({ tracks });
  } catch (error) {
    console.error('WQXR proxy error:', {
      message: error.message,
      code: error.code,
      url,
    });
    return res.status(500).json({
      error: 'Failed to fetch playlist data from WQXR.',
      detail: error.message,
      code: error.code,
      upstreamUrl: url,
    });
  }
}
