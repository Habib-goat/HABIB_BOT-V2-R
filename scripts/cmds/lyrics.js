/**
 * @file lyrics.js
 * @description Advanced Lyrics command for Riyad Bot Framework with multi-API automatic fallback, 
 * Smule/Genius/YouTube metadata helper resolution, request retries, TTL in-memory cache, and robust query cleaning.
 * @author Riyad Bot Framework Developer
 * @version 1.2.0
 */

const axios = require('axios');

// TTL In-Memory Cache configuration
class LyricsCache {
  constructor(maxSize = 150, ttlMs = 3600000) { // 1 Hour TTL by default
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key) {
    this.cleanExpired();
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data) {
    this.cleanExpired();
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}

const lyricsCache = new LyricsCache();

/**
 * Perform an HTTP Request with 1 auto-retry and a default 5-second timeout
 */
async function requestWithRetry(url, options = {}, retries = 1) {
  try {
    return await axios({
      url,
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      ...options
    });
  } catch (error) {
    if (retries > 0) {
      // Delay before retry
      await new Promise(resolve => setTimeout(resolve, 600));
      return requestWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

module.exports = {
  config: {
    name: "lyrics",
    aliases: ["lyric", "lrc"],
    version: "1.2.0",
    author: "Riyad Bot Framework Developer",
    countDown: 5,
    role: 0,
    description: "Search lyrics for English, Bengali, Hindi, Urdu, Arabic, Tamil, and any other song with advanced fallbacks.",
    category: "utility",
    guide: "/lyrics [song name]"
  },

  // Direct root declarations to ensure maximum framework compatibility
  name: "lyrics",
  aliases: ["lyric", "lrc"],

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const queryRaw = args.join(" ");

    // 1. Validate Input Query
    if (!queryRaw || queryRaw.trim() === "") {
      return api.sendMessage(
        "💡 Usage:\n" +
        "• /lyrics <song name>\n" +
        "• /lyrics <artist> <song name>\n\n" +
        "Examples:\n" +
        "👉 /lyrics Believer\n" +
        "👉 /lyrics Arijit Singh Kesariya\n" +
        "👉 /lyrics Habib Mon Majhi Re\n" +
        "👉 /lyrics তুমি বন্ধু কালা পাখি",
        threadID,
        messageID
      );
    }

    // Standardize query for Cache Key matching
    const cacheKey = queryRaw.trim().toLowerCase().replace(/\s+/g, ' ');

    // 2. Return Cache if exists & valid
    const cached = lyricsCache.get(cacheKey);
    if (cached) {
      return sendFormattedLyrics({ api, threadID, messageID, result: cached, queryRaw });
    }

    // Send "searching" status message
    const searchingMsg = await new Promise((resolve) => {
      api.sendMessage("🔍 Searching for lyrics, please wait...", threadID, (err, info) => {
        resolve(info || null);
      }, messageID);
    });

    // 3. Process & Clean Search Input
    let cleanQuery = cleanSearchQuery(queryRaw);
    let parsed = parseQuery(cleanQuery);

    let finalResult = null;

    try {
      // Lookup Pipeline Strategy 1: Search using initial parsed tags
      finalResult = await runFallbackEngine(parsed);

      // Lookup Pipeline Strategy 2: If failed, check Genius public search endpoint to refine song metadata
      if (!finalResult) {
        const geniusMeta = await searchGeniusMetadata(cleanQuery);
        if (geniusMeta && geniusMeta.title) {
          const refinedParsed = {
            cleanQuery: `${geniusMeta.artist} ${geniusMeta.title}`,
            artist: geniusMeta.artist,
            title: geniusMeta.title
          };
          finalResult = await runFallbackEngine(refinedParsed);
        }
      }

      // Lookup Pipeline Strategy 3: If failed, check Smule autocomplete endpoint to refine metadata
      if (!finalResult) {
        const smuleMeta = await searchSmuleMetadata(cleanQuery);
        if (smuleMeta && smuleMeta.title) {
          const refinedParsed = {
            cleanQuery: `${smuleMeta.artist} ${smuleMeta.title}`,
            artist: smuleMeta.artist,
            title: smuleMeta.title
          };
          finalResult = await runFallbackEngine(refinedParsed);
        }
      }

      // Lookup Pipeline Strategy 4: YouTube Scraping as ultimate metadata refinement helper
      if (!finalResult) {
        const ytMeta = await searchYouTubeMetadata(cleanQuery);
        if (ytMeta && ytMeta.title) {
          const cleanYtTitle = cleanSearchQuery(ytMeta.title);
          const parsedYt = parseQuery(cleanYtTitle);
          if (parsedYt.title.toLowerCase() !== parsed.title.toLowerCase()) {
            finalResult = await runFallbackEngine(parsedYt);
          }
        }
      }
    } catch (err) {
      console.error("Lyrics failover pipeline error:", err.message);
    }

    // Cleanup searching indicator
    if (searchingMsg && searchingMsg.messageID) {
      try {
        api.unsendMessage(searchingMsg.messageID);
      } catch (e) {
        // Safe to ignore if unsupported
      }
    }

    // 4. Send Response or Failure
    if (finalResult && finalResult.lyrics && finalResult.lyrics.trim().length > 0) {
      // Store success in Cache
      lyricsCache.set(cacheKey, finalResult);
      return sendFormattedLyrics({ api, threadID, messageID, result: finalResult, queryRaw });
    } else {
      return api.sendMessage(
        "❌ Lyrics not found.\n\n" +
        "Try:\n" +
        "• Artist + Song Name (e.g., /lyrics Imagine Dragons Believer)\n" +
        "• Correct spelling\n" +
        "• Official title (avoid extra bracketed video tags)",
        threadID,
        messageID
      );
    }
  }
};

/**
 * Orchestrate fallbacks across multiple public/free lyric APIs
 */
async function runFallbackEngine(parsed) {
  if (!parsed.title) return null;

  const strategies = [
    // 1. LRCLIB Search
    async () => {
      const query = parsed.artist ? `${parsed.artist} ${parsed.title}` : parsed.cleanQuery;
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      const res = await requestWithRetry(url, { timeout: 5000 }, 1);
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const match = res.data.find(item => item.plainLyrics && item.plainLyrics.trim().length > 0);
        if (match) {
          return {
            lyrics: match.plainLyrics,
            title: match.name,
            artist: match.artistName,
            source: "LRCLIB"
          };
        }
        // Save metadata if we don't have it already
        if (!parsed.artist && res.data[0].artistName) {
          parsed.artist = res.data[0].artistName;
          parsed.title = res.data[0].name;
        }
      }
      throw new Error("No lyric match on LRCLIB Search");
    },

    // 2. LRCLIB Direct API lookup
    async () => {
      if (!parsed.artist || !parsed.title) throw new Error("No metadata for LRCLIB direct get");
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(parsed.artist)}&track_name=${encodeURIComponent(parsed.title)}`;
      const res = await requestWithRetry(url, { timeout: 5000 }, 1);
      if (res.data && res.data.plainLyrics && res.data.plainLyrics.trim().length > 0) {
        return {
          lyrics: res.data.plainLyrics,
          title: res.data.name || parsed.title,
          artist: res.data.artistName || parsed.artist,
          source: "LRCLIB Direct"
        };
      }
      throw new Error("No lyrics on LRCLIB direct lookup");
    },

    // 3. Lyrist API
    async () => {
      let url = `https://lyrist.vercel.app/api/${encodeURIComponent(parsed.title)}`;
      if (parsed.artist) {
        url += `/${encodeURIComponent(parsed.artist)}`;
      }
      const res = await requestWithRetry(url, { timeout: 5000 }, 1);
      if (res.data && res.data.lyrics && res.data.lyrics.trim().length > 0) {
        return {
          lyrics: res.data.lyrics,
          title: res.data.title || parsed.title,
          artist: res.data.artist || parsed.artist || "Unknown Artist",
          source: "Lyrist"
        };
      }
      throw new Error("No lyrics on Lyrist");
    },

    // 4. Lyrics.ovh API fallback
    async () => {
      if (!parsed.artist || !parsed.title) throw new Error("No metadata for Lyrics.ovh");
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(parsed.artist)}/${encodeURIComponent(parsed.title)}`;
      const res = await requestWithRetry(url, { timeout: 5000 }, 1);
      if (res.data && res.data.lyrics && res.data.lyrics.trim().length > 0) {
        return {
          lyrics: res.data.lyrics,
          title: parsed.title,
          artist: parsed.artist,
          source: "Lyrics.ovh"
        };
      }
      throw new Error("No lyrics on Lyrics.ovh");
    }
  ];

  for (const strategy of strategies) {
    try {
      const res = await strategy();
      if (res && res.lyrics && res.lyrics.trim().length > 0) {
        return res;
      }
    } catch (err) {
      // Fallback silently to the next source in pipeline
    }
  }

  return null;
}

/**
 * Free/Public Genius search metadata helper
 */
async function searchGeniusMetadata(query) {
  try {
    const url = `https://genius.com/api-search/multi?q=${encodeURIComponent(query)}`;
    const res = await requestWithRetry(url, { timeout: 4500 }, 1);
    const sections = res.data?.response?.sections || [];
    const songSection = sections.find(s => s.type === 'song' || s.type === 'top_hit');
    const hit = songSection?.hits?.[0]?.result;
    if (hit && hit.title) {
      return {
        title: hit.title,
        artist: hit.primary_artist?.name || ""
      };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

/**
 * Optional Smule Autocomplete API metadata helper
 */
async function searchSmuleMetadata(query) {
  try {
    const url = `https://www.smule.com/autocomplete/search?q=${encodeURIComponent(query)}`;
    const res = await requestWithRetry(url, { timeout: 4000 }, 1);
    if (res.data && res.data.songs && Array.isArray(res.data.songs) && res.data.songs.length > 0) {
      const song = res.data.songs[0];
      return {
        title: song.title,
        artist: song.artist
      };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

/**
 * Optional YouTube Search Metadata Helper
 */
async function searchYouTubeMetadata(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await requestWithRetry(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, 1);
    const html = res.data;

    // Parse ytInitialData JSON structure first
    const jsonMatch = html.match(/ytInitialData\s*=\s*({[\s\S]+?});<\/script>/) || html.match(/ytInitialData\s*=\s*({[\s\S]+?});/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const contents = parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
        for (const item of contents) {
          if (item.videoRenderer) {
            const video = item.videoRenderer;
            const title = video.title?.runs?.[0]?.text || "";
            const owner = video.ownerText?.runs?.[0]?.text || "";
            if (title && owner) {
              return { title, artist: owner.replace(/ - Topic$/i, "") };
            }
          }
        }
      } catch (e) {
        // Fallback to RegExp below
      }
    }

    // RegExp parse fallback
    const videoRegex = /"videoRenderer":\s*\{[\s\S]+?"title":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"([^"]+)"[\s\S]+?"ownerText":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"([^"]+)"/g;
    let match;
    while ((match = videoRegex.exec(html)) !== null) {
      if (match[1] && match[2]) {
        return {
          title: match[1],
          artist: match[2].replace(/ - Topic$/i, "")
        };
      }
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

/**
 * Format and safe-chunk output messages avoiding 2000 character Messenger limit
 */
function sendFormattedLyrics({ api, threadID, messageID, result, queryRaw }) {
  const titleText = result.title || queryRaw;
  const artistText = result.artist || "Unknown Artist";
  const header = `🎵 Song: ${titleText}\n👤 Artist: ${artistText}\n━━━━━━━━━━━━━━\n\n`;
  const footer = `\n━━━━━━━━━━━━━━\nSource: ${result.source}`;

  const MAX_LIMIT = 2000;
  const availableLimit = MAX_LIMIT - header.length - footer.length - 20;

  if (result.lyrics.length <= availableLimit) {
    return api.sendMessage(`${header}${result.lyrics}${footer}`, threadID, messageID);
  } else {
    const chunks = splitLyrics(result.lyrics, availableLimit);
    for (let i = 0; i < chunks.length; i++) {
      const chunkHeader = `🎵 Song: ${titleText}\n👤 Artist: ${artistText} (${i + 1}/${chunks.length})\n━━━━━━━━━━━━━━\n\n`;
      const chunkFooter = `\n━━━━━━━━━━━━━━\nSource: ${result.source} (Part ${i + 1}/${chunks.length})`;
      
      setTimeout(() => {
        api.sendMessage(`${chunkHeader}${chunks[i]}${chunkFooter}`, threadID, messageID);
      }, i * 650);
    }
  }
}

/**
 * Robust Cleaning for common video headers and redundant noise symbols
 */
function cleanSearchQuery(query) {
  if (!query) return "";
  return query
    .replace(/\([\s\S]*?\)/g, "")
    .replace(/\[[\s\S]*?\]/g, "")
    .replace(/\{[\s\S]*?\}/g, "")
    .replace(/\b(official\s+video|official\s+audio|lyrics?\s+video|music\s+video|lyric\s+card|audio\s+only|hd|4k|mv|full\s+song|remastered|karaoke|live\s+performance|official)\b/gi, "")
    // Preserve common multilingual characters for Bengali, Hindi, Urdu, Arabic, Tamil, Telugu, and alphanumeric keys
    .replace(/[^\w\s\u00C0-\u00FF\u0100-\u017F\u0400-\u04FF\u0900-\u097F\u0980-\u09FF\u0600-\u06FF\u0750-\u077F\u0B80-\u0BFF\u0C00-\u0C7F]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse artist and song title using natural separator tokens
 */
function parseQuery(query) {
  let artist = "";
  let title = query;

  const separators = [
    { regex: /\s+-\s+/, split: " - " },
    { regex: /\s+by\s+/i, split: " by " },
    { regex: /\s+from\s+/i, split: " from " },
    { regex: /\s+feat\.?\s+/i, split: " feat " },
    { regex: /\s+ft\.?\s+/i, split: " ft " }
  ];

  for (const sep of separators) {
    if (sep.regex.test(query)) {
      const parts = query.split(sep.regex);
      if (parts.length >= 2) {
        const lowerSplit = sep.split.trim().toLowerCase();
        if (lowerSplit === 'by') {
          title = parts[0].trim();
          artist = parts[1].trim();
        } else if (lowerSplit === 'feat' || lowerSplit === 'ft') {
          title = parts[0].trim();
          artist = parts[1].trim();
        } else {
          artist = parts[0].trim();
          title = parts[1].trim();
        }
        break;
      }
    }
  }

  return {
    cleanQuery: query,
    artist: artist.trim(),
    title: title.trim()
  };
}

/**
 * Split long texts preserving linebreaks and paragraph boundaries
 */
function splitLyrics(lyrics, limit) {
  const paragraphs = lyrics.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length > limit) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        const lines = para.split('\n');
        for (const line of lines) {
          if ((currentChunk + "\n" + line).length > limit) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = line;
            } else {
              chunks.push(line.substring(0, limit));
              currentChunk = line.substring(limit);
            }
          } else {
            currentChunk += (currentChunk === "" ? "" : "\n") + line;
          }
        }
      }
    } else {
      currentChunk += (currentChunk === "" ? "" : "\n\n") + para;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
