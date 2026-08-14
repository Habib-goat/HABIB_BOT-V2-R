/**
 * Riyad Bot Framework
 *
 * Thin wrapper around the user's own riyad-video-api (hosted on Render),
 * matched exactly to that server's endpoint shapes:
 *
 *   GET /api/video/search?songName=<query>
 *     -> [ { id, title, duration, thumbnail, url }, ... ]
 *
 *   GET /api/video/lyrics?songName=<query>
 *     -> same shape as /search, but prioritizes lyric-video results
 *
 *   GET /api/video/download?link=<videoID or URL>&format=mp4|mp3
 *     -> { downloadLink, title }
 *
 * Used by vidio.js, sing.js, and lv.js via:
 *   const { search, lyricsSearch, resolveDownload } = require("../utils/riyadVideoApi");
 */
"use strict";

const axios = require("axios");

const BASE_URL = "https://riyad-video-api.onrender.com";

// Render free-tier services spin down after inactivity — the first request
// after a period of idle can take 30-60s to "wake" the server. Give search
// calls a generous timeout so that cold start doesn't look like a failure.
const SEARCH_TIMEOUT = 60000;
const DOWNLOAD_TIMEOUT = 60000;

/**
 * Search for videos by name.
 * @param {string} query
 * @returns {Promise<Array<{id: string, title: string, duration: string, thumbnail: string, url: string}>>}
 */
async function search(query) {
	try {
		const res = await axios.get(`${BASE_URL}/api/video/search`, {
			params: { songName: query },
			timeout: SEARCH_TIMEOUT
		});
		return Array.isArray(res.data) ? res.data : [];
	} catch (err) {
		// 404 with an empty array is how the API signals "no results" — treat it the same as an empty list
		if (err.response?.status === 404) return [];
		throw new Error(err.response?.data?.error || err.message);
	}
}

/**
 * Search for lyrics-video versions of a song.
 * @param {string} query
 * @returns {Promise<Array<{id: string, title: string, duration: string, thumbnail: string, url: string}>>}
 */
async function lyricsSearch(query) {
	try {
		const res = await axios.get(`${BASE_URL}/api/video/lyrics`, {
			params: { songName: query },
			timeout: SEARCH_TIMEOUT
		});
		return Array.isArray(res.data) ? res.data : [];
	} catch (err) {
		if (err.response?.status === 404) return [];
		throw new Error(err.response?.data?.error || err.message);
	}
}

/**
 * Resolve a direct, temporary download link for a video ID (or full URL).
 * @param {string} idOrUrl - a YouTube video ID (e.g. "dQw4w9WgXcQ") or full URL
 * @param {"mp4"|"mp3"} format
 * @returns {Promise<{downloadLink: string, title: string}>}
 */
async function resolveDownload(idOrUrl, format = "mp4") {
	try {
		const res = await axios.get(`${BASE_URL}/api/video/download`, {
			params: { link: idOrUrl, format },
			timeout: DOWNLOAD_TIMEOUT
		});
		if (!res.data?.downloadLink) {
			throw new Error("No downloadLink in API response");
		}
		return res.data;
	} catch (err) {
		throw new Error(err.response?.data?.detail || err.response?.data?.error || err.message);
	}
}

module.exports = { search, lyricsSearch, resolveDownload };
