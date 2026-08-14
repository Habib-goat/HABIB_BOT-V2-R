/**
 * Riyad Bot Framework
 *
 * Wrapper around your own riyad-pinterest-api server.
 * ⚠️ Update BASE_URL once you've deployed pinterest-api-server.js to Render.
 */
"use strict";

const axios = require("axios");

const BASE_URL = "https://riyad-pinterest-api.onrender.com"; // <-- put your deployed Render URL here

const TIMEOUT = 30000; // Render free tier cold start — same as riyadVideoApi.js

async function search(query, limit = 10) {
	try {
		const res = await axios.get(`${BASE_URL}/api/pinterest/search`, {
			params: { query, limit },
			timeout: TIMEOUT
		});
		return Array.isArray(res.data) ? res.data : [];
	} catch (err) {
		if (err.response?.status === 404) return [];
		throw new Error(err.response?.data?.error || err.message);
	}
}

async function getMediaById(id) {
	try {
		const res = await axios.get(`${BASE_URL}/api/pinterest/media`, {
			params: { id },
			timeout: TIMEOUT
		});
		return res.data;
	} catch (err) {
		throw new Error(err.response?.data?.error || err.message);
	}
}

async function resolveUrl(url) {
	try {
		const res = await axios.get(`${BASE_URL}/api/pinterest/resolve`, {
			params: { url },
			timeout: TIMEOUT
		});
		return res.data;
	} catch (err) {
		throw new Error(err.response?.data?.error || err.message);
	}
}

module.exports = { search, getMediaById, resolveUrl };
