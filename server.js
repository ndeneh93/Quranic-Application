const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

const bookmarks = {};
const API_BASE_URL = 'https://api.quran.com/api/v4';

let cachedChapters = null;
async function getChapters() {
  if (!cachedChapters) {
    try {
      const response = await axios.get(`${API_BASE_URL}/chapters?language=en`);
      cachedChapters = response.data.chapters;
      console.log('Chapters cached:', cachedChapters.length);
    } catch (error) {
      console.error('Error caching chapters:', error.message);
      throw error;
    }
  }
  return cachedChapters;
}

// Chapters List Route
app.get('/', async (req, res) => {
  try {
    const chapters = await getChapters();
    res.render('chapters', { chapters });
  } catch (error) {
    console.error('Error in chapters route:', error.message);
    res.status(500).render('error', { message: 'Failed to load chapters. Please try again later.' });
  }
});

// Handle /chapter without ID (covers /chapter and /chapter/)
app.get('/chapter/:id?', (req, res) => {
  if (!req.params.id) {
    res.redirect('/');
  } else {
    const chapterId = parseInt(req.params.id);
    const userIp = req.ip;

    if (isNaN(chapterId) || chapterId < 1 || chapterId > 114) {
      return res.status(400).render('error', { message: 'Invalid chapter ID' });
    }

    Promise.all([
      axios.get(`${API_BASE_URL}/verses/by_chapter/${chapterId}?language=en&translations=131`),
      axios.get(`${API_BASE_URL}/chapters/${chapterId}?language=en`)
    ])
      .then(([versesResp, chapterResp]) => {
        const verses = versesResp.data.verses.map(v => ({
          verse_key: v.verse_key,
          text: v.text_uthmani,
          translation: v.translations[0].text,
          verse_number: v.verse_key.split(':')[1]
        }));
        const userBookmarks = bookmarks[userIp] || [];

        res.render('chapter', {
          chapterId,
          chapterName: chapterResp.data.chapter.name_simple,
          verses,
          userBookmarks,
          userIp
        });
      })
      .catch(error => {
        console.error('Error fetching chapter:', error.message);
        res.status(500).render('error', { message: 'Failed to load chapter. Please try again later.' });
      });
  }
});

// Bookmark Route
app.post('/bookmark', (req, res) => {
  const { verseId, chapterId } = req.body;
  const userIp = req.ip;

  if (!verseId || !chapterId || isNaN(parseInt(chapterId))) {
    return res.status(400).render('error', { message: 'Invalid bookmark data' });
  }

  if (!bookmarks[userIp]) bookmarks[userIp] = [];
  if (!bookmarks[userIp].includes(verseId)) {
    bookmarks[userIp].push(verseId);
    console.log(`Bookmarked ${verseId} for ${userIp}`);
  }
  res.redirect(`/chapter/${chapterId}`);
});

// Remove Bookmark Route
app.post('/remove-bookmark', (req, res) => {
  const { verseId, chapterId } = req.body;
  const userIp = req.ip;

  if (!verseId || !chapterId || isNaN(parseInt(chapterId))) {
    return res.status(400).render('error', { message: 'Invalid bookmark data' });
  }

  if (bookmarks[userIp]) {
    bookmarks[userIp] = bookmarks[userIp].filter(id => id !== verseId);
    console.log(`Removed bookmark ${verseId} for ${userIp}`);
  }
  res.redirect(`/chapter/${chapterId}`);
});

// Bookmarks Route
app.get('/bookmarks', async (req, res) => {
  const userIp = req.ip;
  const userBookmarks = bookmarks[userIp] || [];

  if (userBookmarks.length === 0) {
    return res.render('bookmarks', { verses: [] });
  }

  try {
    const versePromises = userBookmarks.map(verseId =>
      axios.get(`${API_BASE_URL}/verses/by_key/${verseId}?language=en&translations=131`)
    );
    const verseResponses = await Promise.all(versePromises);
    const verses = verseResponses.map(resp => ({
      verse_key: resp.data.verse.verse_key,
      text: resp.data.verse.text_uthmani,
      translation: resp.data.verse.translations[0].text,
      verse_number: resp.data.verse.verse_key.split(':')[1]
    }));
    res.render('bookmarks', { verses });
  } catch (error) {
    console.error('Error in bookmarks route:', error.message);
    res.status(500).render('error', { message: 'Failed to load bookmarks. Please try again later.' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});