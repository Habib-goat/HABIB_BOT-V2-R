/**
 * @file lyrics.js
 * @description Advanced interactive lyrics search command for Riyad Bot Framework.
 * Features multi-API lookup, automatic fallback, request retries, TTL session tracking, and smart long lyrics splitting.
 * @version 1.0.0
 */

const axios = require("axios");

// Active interactive sessions map to track user selections
// Key: threadID_senderID -> { results: Array, timeoutId: Timeout, botMessageID: String, timestamp: Number }
const sessions = new Map();

/**
 * Perform an HTTP GET request with retries and timeout
 */
async function axiosGetWithRetry(url, options = {}, retries = 1) {
  try {
    return await axios.get(url, {
      ...options,
      timeout: options.timeout || 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return axiosGetWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * Clean search results of promotional video/audio jargon tags safely across all language scripts
 */
function removePromoTags(str) {
  if (!str) return "";
  return str
    .replace(/\((official\s+video|official\s+audio|lyrics?\s+video|music\s+video|lyric\s+card|audio\s+only|hd|4k|mv|full\s+song|remastered|karaoke|live\s+performance|official)\)/gi, "")
    .replace(/\[(official\s+video|official\s+audio|lyrics?\s+video|music\s+video|lyric\s+card|audio\s+only|hd|4k|mv|full\s+song|remastered|karaoke|live\s+performance|official)\]/gi, "")
    .replace(/\b(official\s+video|official\s+audio|lyrics?\s+video|music\s+video|lyric\s+card|audio\s+only|hd|4k|mv|full\s+song|remastered|karaoke|live\s+performance|official)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize and deduplicate search results to yield up to 6–7 unique match options
 */
function deduplicateResults(results) {
  const seen = new Set();
  const unique = [];

  for (const item of results) {
    if (!item.title || !item.artist) continue;

    const cleanArtist = item.artist.toLowerCase()
      .replace(/\s+/g, "")
      .replace(/vevo|topic|official/gi, "");

    const cleanTitle = removePromoTags(item.title)
      .toLowerCase()
      .replace(/\s+/g, "");

    const key = `${cleanArtist}_${cleanTitle}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique.slice(0, 7);
}

/**
 * Multi-source query engine across LRCLIB, Genius, and Smule Autocomplete
 */
async function searchSongs(query) {
  const results = [];
  const cleanQuery = query.trim();

  // 1. Try LRCLIB Search
  try {
    const res = await axiosGetWithRetry(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanQuery)}`, {}, 1);
    if (res.data && Array.isArray(res.data)) {
      for (const item of res.data) {
        if (item.name && item.artistName) {
          results.push({
            title: item.name,
            artist: item.artistName,
            source: "LRCLIB"
          });
        }
      }
    }
  } catch (err) {
    console.error("[Lyrics] LRCLIB search fallback error:", err.message);
  }

  // 2. Try Genius Public Multi Search (highly reliable fallback)
  try {
    const res = await axiosGetWithRetry(`https://genius.com/api-search/multi?q=${encodeURIComponent(cleanQuery)}`, {}, 1);
    const sections = res.data?.response?.sections || [];
    const songSection = sections.find((s) => s.type === "song" || s.type === "top_hit");
    if (songSection && Array.isArray(songSection.hits)) {
      for (const hit of songSection.hits) {
        const result = hit.result;
        if (result && result.title && result.primary_artist?.name) {
          results.push({
            title: result.title,
            artist: result.primary_artist.name,
            source: "Genius"
          });
        }
      }
    }
  } catch (err) {
    console.error("[Lyrics] Genius search fallback error:", err.message);
  }

  // 3. Try Smule Autocomplete (excellent auxiliary source)
  try {
    const res = await axiosGetWithRetry(`https://www.smule.com/autocomplete/search?q=${encodeURIComponent(cleanQuery)}`, {}, 1);
    if (res.data && Array.isArray(res.data.songs)) {
      for (const song of res.data.songs) {
        if (song.title && song.artist) {
          results.push({
            title: song.title,
            artist: song.artist,
            source: "Smule"
          });
        }
      }
    }
  } catch (err) {
    console.error("[Lyrics] Smule search fallback error:", err.message);
  }

  return deduplicateResults(results);
}

/**
 * Fetch lyrics from multiple free lyrics endpoints
 */
async function fetchLyrics(title, artist) {
  // 1. Try LRCLIB direct get endpoint
  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
    const res = await axiosGetWithRetry(url, {}, 1);
    if (res.data && res.data.plainLyrics) {
      return {
        lyrics: res.data.plainLyrics,
        source: "LRCLIB"
      };
    }
  } catch (err) {
    console.error("[Lyrics] LRCLIB direct lookup failed:", err.message);
  }

  // 2. Try Lyrist API
  try {
    const url = `https://lyrist.vercel.app/api/${encodeURIComponent(title)}/${encodeURIComponent(artist)}`;
    const res = await axiosGetWithRetry(url, {}, 1);
    if (res.data && res.data.lyrics) {
      return {
        lyrics: res.data.lyrics,
        source: "Lyrist"
      };
    }
  } catch (err) {
    console.error("[Lyrics] Lyrist lookup failed:", err.message);
  }

  // 3. Try Lyrics.ovh API
  try {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await axiosGetWithRetry(url, {}, 1);
    if (res.data && res.data.lyrics) {
      return {
        lyrics: res.data.lyrics,
        source: "Lyrics.ovh"
      };
    }
  } catch (err) {
    console.error("[Lyrics] Lyrics.ovh lookup failed:", err.message);
  }

  // 4. Try LRCLIB search backup
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + " " + title)}`;
    const res = await axiosGetWithRetry(url, {}, 1);
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      const match = res.data.find((item) => item.plainLyrics);
      if (match) {
        return {
          lyrics: match.plainLyrics,
          source: "LRCLIB Fallback"
        };
      }
    }
  } catch (err) {
    console.error("[Lyrics] LRCLIB search fallback failed:", err.message);
  }

  return null;
}

/**
 * Splits lyrics into chunks under standard Messenger character limits without slicing lines or paragraphs
 */
function splitText(text, maxLength = 1800) {
  if (text.length <= maxLength) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + (currentChunk ? "\n\n" : "") + paragraph).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        // Single paragraph exceeds limit, split by individual lines
        const lines = paragraph.split("\n");
        for (const line of lines) {
          if ((currentChunk + (currentChunk ? "\n" : "") + line).length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk);
              currentChunk = line;
            } else {
              // Extremely long line, divide by words
              const words = line.split(" ");
              for (const word of words) {
                if ((currentChunk + (currentChunk ? " " : "") + word).length > maxLength) {
                  chunks.push(currentChunk);
                  currentChunk = word;
                } else {
                  currentChunk += (currentChunk ? " " : "") + word;
                }
              }
            }
          } else {
            currentChunk += (currentChunk ? "\n" : "") + line;
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

module.exports = {
  config: {
    name: "lyrics",
    aliases: ["lyric", "lrc"],
    version: "1.0.0",
    author: "AI",
    role: 0,
    category: "utility",
    description: "Search song lyrics across free keyless APIs with interactive result selections.",
    guide: "{pn} <song name>",
    countDown: 5
  },

  // Direct declarations to guarantee compatibility in all framework editions
  name: "lyrics",
  aliases: ["lyric", "lrc"],

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const query = args.join(" ");

    if (!query || query.trim() === "") {
      return api.sendMessage(
        "💡 Usage:\n" +
        "• /lyrics <song name>\n" +
        "• /lyrics <artist> <song name>\n\n" +
        "Examples:\n" +
        "👉 /lyrics believer\n" +
        "👉 /lyrics kesariya\n" +
        "👉 /lyrics mon majhi re\n" +
        "👉 /lyrics তুমি বন্ধু কালা পাখি",
        threadID,
        messageID
      );
    }

    // Send visual indicator
    api.sendMessage("🔍 Searching for lyrics, please wait...", threadID, async (err, info) => {
      if (err) console.error("[Lyrics] Error sending load indicator:", err);

      try {
        const results = await searchSongs(query);

        if (results.length === 0) {
          return api.sendMessage(
            "❌ No lyrics or song matches found. Please try correcting spelling or typing Artist + Song Name.",
            threadID,
            messageID
          );
        }

        // Format search options list (up to 6-7 items)
        let responseText = "🎵 Search Results\n\n";
        for (let i = 0; i < results.length; i++) {
          responseText += `${i + 1}. ${results[i].title} — ${results[i].artist}\n`;
        }
        responseText += "\nReply with a number (1-7) to choose.";

        // Send formatted selection message
        api.sendMessage(responseText, threadID, (err, searchMsgInfo) => {
          if (err) return console.error("[Lyrics] Error sending search choices:", err);

          const sessionKey = `${threadID}_${event.senderID}`;

          // Cancel any existing session and its timeout to prevent memory leak
          if (sessions.has(sessionKey)) {
            const oldSession = sessions.get(sessionKey);
            if (oldSession.timeoutId) clearTimeout(oldSession.timeoutId);
          }

          // Clear session automatically after 5 minutes of inactivity
          const timeoutId = setTimeout(() => {
            if (sessions.has(sessionKey)) {
              sessions.delete(sessionKey);
            }
          }, 5 * 60 * 1000);

          sessions.set(sessionKey, {
            results,
            timeoutId,
            botMessageID: searchMsgInfo ? searchMsgInfo.messageID : null,
            timestamp: Date.now()
          });
        }, messageID);

      } catch (searchError) {
        console.error("[Lyrics] Search error:", searchError);
        api.sendMessage("❌ An error occurred while searching for lyrics.", threadID, messageID);
      }
    }, messageID);
  },

  onChat: async function ({ api, event }) {
    const { threadID, senderID, body, messageID } = event;
    if (!body) return;

    const sessionKey = `${threadID}_${senderID}`;
    const session = sessions.get(sessionKey);

    // If there's no active search session, ignore message to avoid blocking casual chat
    if (!session) return;

    // Check expiration safety
    if (Date.now() - session.timestamp > 5 * 60 * 1000) {
      if (session.timeoutId) clearTimeout(session.timeoutId);
      sessions.delete(sessionKey);
      return;
    }

    const input = body.trim();

    // Check cancellation command
    if (["cancel", "exit", "stop", "close"].includes(input.toLowerCase())) {
      if (session.timeoutId) clearTimeout(session.timeoutId);
      sessions.delete(sessionKey);
      return api.sendMessage("❌ Lyrics search cancelled.", threadID, messageID);
    }

    const choice = parseInt(input);
    const maxChoice = session.results.length;

    // Validate the input choice
    if (isNaN(choice) || choice < 1 || choice > maxChoice) {
      return api.sendMessage(`❌ Please reply with a number between 1 and ${maxChoice}.`, threadID, messageID);
    }

    // Clear session immediately once a valid choice is detected
    if (session.timeoutId) clearTimeout(session.timeoutId);
    sessions.delete(sessionKey);

    const chosenSong = session.results[choice - 1];

    // Inform user of fetch action
    api.sendMessage(`⏳ Fetching lyrics for "${chosenSong.title}"...`, threadID, async (err) => {
      try {
        const lyricsData = await fetchLyrics(chosenSong.title, chosenSong.artist);

        if (!lyricsData || !lyricsData.lyrics || lyricsData.lyrics.trim().length === 0) {
          return api.sendMessage(
            `❌ Sorry, I found metadata for "${chosenSong.title}" but was unable to fetch its lyrics from free APIs.`,
            threadID,
            messageID
          );
        }

        const chunks = splitText(lyricsData.lyrics, 1800);

        if (chunks.length === 1) {
          const finalMsg = `🎵 Song: ${chosenSong.title}\n👤 Artist: ${chosenSong.artist}\n━━━━━━━━━━━━━━\n\n${chunks[0]}\n\n━━━━━━━━━━━━━━\nSource: ${lyricsData.source}`;
          api.sendMessage(finalMsg, threadID, messageID);
        } else {
          for (let i = 0; i < chunks.length; i++) {
            const partHeader = `🎵 Song: ${chosenSong.title}\n👤 Artist: ${chosenSong.artist} (Part ${i + 1}/${chunks.length})\n━━━━━━━━━━━━━━\n\n`;
            const partFooter = `\n\n━━━━━━━━━━━━━━\nSource: ${lyricsData.source} (Part ${i + 1}/${chunks.length})`;
            const finalMsg = `${partHeader}${chunks[i]}${partFooter}`;

            // Small delay to ensure order preservation in Messenger
            setTimeout(() => {
              api.sendMessage(finalMsg, threadID, messageID);
            }, i * 750);
          }
        }
      } catch (fetchError) {
        console.error("[Lyrics] Fetch error:", fetchError);
        api.sendMessage("❌ An error occurred while retrieving the selected lyrics.", threadID, messageID);
      }
    }, messageID);
  }
};
