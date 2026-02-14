/**
 * Bridge - YouTube Data API v3
 * OAuth via chrome.identity.getAuthToken (Google).
 */

const YouTube = (function () {
  'use strict';

  const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

  /**
   * Get Google OAuth token (for YouTube API).
   * @returns {Promise<string>}
   */
  function getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Google login failed'));
          return;
        }
        resolve(token);
      });
    });
  }

  /**
   * Clear Google auth (sign out).
   */
  function clearAuth() {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, resolve);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * YouTube API request.
   * @param {string} token
   * @param {string} path - e.g. playlists?part=snippet&mine=true
   * @param {RequestInit} opts
   * @returns {Promise<any>}
   */
  async function api(token, path, opts = {}) {
    const url = path.startsWith('http') ? path : YT_API_BASE + path;
    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || 'YouTube API error');
    }
    return text ? JSON.parse(text) : null;
  }

  /**
   * Fetch all playlists for the current user.
   * @param {string} token
   * @returns {Promise<Array<{ id: string, name: string, trackCount?: number }>>}
   */
  async function getPlaylists(token) {
    const list = [];
    let pageToken = '';
    do {
      const q = 'playlists?part=snippet&mine=true&maxResults=50' + (pageToken ? '&pageToken=' + pageToken : '');
      const data = await api(token, q);
      const items = data.items || [];
      for (const p of items) {
        list.push({
          id: p.id,
          name: (p.snippet && p.snippet.title) || '',
          trackCount: (p.contentDetails && p.contentDetails.itemCount) || 0
        });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return list;
  }

  /**
   * Create a new playlist.
   * @param {string} token
   * @param {string} title
   * @returns {Promise<string>} playlist id
   */
  async function createPlaylist(token, title) {
    const body = {
      snippet: { title, description: 'Created by Bridge' },
      status: { privacyStatus: 'private' }
    };
    const data = await api(token, 'playlists?part=snippet,status', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return data.id;
  }

  /**
   * Search for a video (first result).
   * @param {string} token
   * @param {string} query - e.g. "song name artist official audio"
   * @returns {Promise<{ videoId: string }|null>}
   */
  async function searchFirst(token, query) {
    const q = 'search?part=snippet&type=video&maxResults=1&q=' + encodeURIComponent(query);
    const data = await api(token, q);
    const items = data.items || [];
    if (items.length === 0) return null;
    const id = items[0].id && items[0].id.videoId;
    return id ? { videoId: id } : null;
  }

  /**
   * Add a video to a playlist.
   * @param {string} token
   * @param {string} playlistId
   * @param {string} videoId
   * @returns {Promise<void>}
   */
  async function addPlaylistItem(token, playlistId, videoId) {
    await api(token, 'playlistItems?part=snippet', {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId }
        }
      })
    });
  }

  /**
   * Get all video IDs in a playlist (to prevent duplicates).
   * @param {string} token
   * @param {string} playlistId
   * @returns {Promise<Set<string>>}
   */
  async function getPlaylistVideoIds(token, playlistId) {
    const ids = new Set();
    let pageToken = '';
    do {
      const q = 'playlistItems?part=contentDetails&maxResults=50&playlistId=' + playlistId +
        (pageToken ? '&pageToken=' + pageToken : '');
      const data = await api(token, q);
      const items = data.items || [];
      for (const it of items) {
        const vid = it.contentDetails && it.contentDetails.videoId;
        if (vid) ids.add(vid);
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return ids;
  }

  /**
   * Get playlist items (tracks) for display when source is YouTube.
   * @param {string} token
   * @param {string} playlistId
   * @returns {Promise<Array<{ title: string, artist: string, videoId: string }>>}
   */
  async function getPlaylistTracks(token, playlistId) {
    const list = [];
    let pageToken = '';
    do {
      const q = 'playlistItems?part=snippet&maxResults=50&playlistId=' + playlistId +
        (pageToken ? '&pageToken=' + pageToken : '');
      const data = await api(token, q);
      const items = data.items || [];
      for (const it of items) {
        const sn = it.snippet || {};
        const title = sn.title || '';
        const channel = (sn.videoOwnerChannelTitle || sn.channelTitle || '').trim();
        const videoId = (sn.resourceId && sn.resourceId.videoId) || '';
        if (videoId) {
          list.push({ title, artist: channel, videoId });
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return list;
  }

  return {
    getAuthToken,
    clearAuth,
    api,
    getPlaylists,
    createPlaylist,
    searchFirst,
    addPlaylistItem,
    getPlaylistVideoIds,
    getPlaylistTracks
  };
})();

if (typeof self !== 'undefined') self.BridgeYouTube = YouTube;
if (typeof window !== 'undefined') window.BridgeYouTube = YouTube;
