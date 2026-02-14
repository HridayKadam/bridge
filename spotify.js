/**
 * Bridge - Spotify API (OAuth PKCE + Web API)
 * Uses chrome.identity.launchWebAuthFlow for Spotify login.
 */

const Spotify = (function () {
  'use strict';

  const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
  const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
  const SCOPES = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private'
  ].join(' ');

  /**
   * Get stored Spotify access token.
   * @returns {Promise<string|null>}
   */
  async function getStoredToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['spotify_access_token'], (data) => {
        resolve(data.spotify_access_token || null);
      });
    });
  }

  /**
   * Store Spotify tokens.
   * @param {string} accessToken
   * @param {number} expiresIn
   */
  function storeTokens(accessToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    chrome.storage.local.set({
      spotify_access_token: accessToken,
      spotify_expires_at: expiresAt
    });
  }

  /**
   * Clear Spotify tokens.
   */
  function clearTokens() {
    chrome.storage.local.remove(['spotify_access_token', 'spotify_expires_at']);
  }

  /**
   * Check if token is expired (with 60s buffer).
   * @param {number} expiresAt
   * @returns {boolean}
   */
  function isExpired(expiresAt) {
    return !expiresAt || Date.now() >= expiresAt - 60000;
  }

  /**
   * Launch Spotify OAuth (Authorization Code + PKCE).
   * @param {string} clientId - From config.
   * @param {string} redirectUrl - chrome.identity.getRedirectURL().
   * @returns {Promise<string>} access_token
   */
  async function login(clientId, redirectUrl) {
    const Utils = typeof self !== 'undefined' ? self.BridgeUtils : window.BridgeUtils;
    const { codeVerifier, codeChallenge } = await Utils.generatePKCE();

    const authParams = {
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUrl,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      show_dialog: 'false'
    };

    const authURL = Utils.buildURL(SPOTIFY_AUTH_URL, authParams);
    console.log('Spotify Auth URL:', authURL);
    console.log('Redirect URL:', redirectUrl);

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authURL, interactive: true },
        async (redirectUrlResult) => {
          console.log('Auth flow result:', redirectUrlResult);
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || 'Authorization page could not be loaded';
            console.error('Runtime error message:', errMsg);
            reject(new Error(errMsg));
            return;
          }
          if (!redirectUrlResult) {
            console.error('No redirect URL result');
            reject(new Error('No redirect URL - check Spotify redirect URI in app settings'));
            return;
          }
          if (!redirectUrlResult.includes('code=')) {
            console.error('No code in redirect URL:', redirectUrlResult);
            reject(new Error('No authorization code in redirect'));
            return;
          }

          const u = new URL(redirectUrlResult);
          const code = u.searchParams.get('code');
          if (!code) {
            reject(new Error('Missing code parameter'));
            return;
          }

          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUrl,
            code_verifier: codeVerifier,
            client_id: clientId
          });

          const res = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            reject(new Error(data.error_description || data.error || 'Token exchange failed'));
            return;
          }

          storeTokens(data.access_token, data.expires_in || 3600);
          resolve(data.access_token);
        }
      );
    });
  }

  /**
   * Get valid access token (refresh or re-login not implemented for brevity; token is long-lived for PKCE).
   * @param {string} clientId
   * @param {string} redirectUrl
   * @returns {Promise<string|null>}
   */
  async function getValidToken(clientId, redirectUrl) {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['spotify_access_token', 'spotify_expires_at'], resolve);
    });
    if (data.spotify_access_token && !isExpired(data.spotify_expires_at)) {
      return data.spotify_access_token;
    }
    return null;
  }

  /**
   * Spotify API request helper.
   * @param {string} accessToken
   * @param {string} path - e.g. /me/playlists
   * @param {RequestInit} opts
   * @returns {Promise<any>}
   */
  async function api(accessToken, path, opts = {}) {
    const url = path.startsWith('http') ? path : SPOTIFY_API_BASE + path;
    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      }
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || 'Spotify API error');
    }
    return text ? JSON.parse(text) : null;
  }

  /**
   * Fetch all playlists (with pagination).
   * @param {string} accessToken
   * @returns {Promise<Array<{ id: string, name: string, tracks: { total: number } }>>}
   */
  async function getPlaylists(accessToken) {
    const list = [];
    let url = '/me/playlists?limit=50';
    while (url) {
      const data = await api(accessToken, url);
      const items = data.items || [];
      list.push(...items.map((p) => ({
        id: p.id,
        name: p.name,
        tracks: { total: (p.tracks && p.tracks.total) || 0 }
      })));
      url = data.next ? data.next.replace(SPOTIFY_API_BASE, '') : null;
    }
    return list;
  }

  /**
   * Get all tracks of a playlist.
   * @param {string} accessToken
   * @param {string} playlistId
   * @returns {Promise<Array<{ title: string, artist: string, id: string }>>}
   */
  async function getPlaylistTracks(accessToken, playlistId) {
    const list = [];
    let url = `/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name)))`;
    while (url) {
      const data = await api(accessToken, url);
      const items = data.items || [];
      for (const it of items) {
        const t = it.track;
        if (!t || !t.id) continue;
        const artist = (t.artists && t.artists[0] && t.artists[0].name) || '';
        list.push({
          id: t.id,
          title: t.name || '',
          artist
        });
      }
      url = data.next ? data.next.replace(SPOTIFY_API_BASE, '') : null;
    }
    return list;
  }

  /**
   * Add tracks to a Spotify playlist.
   * @param {string} accessToken
   * @param {string} playlistId
   * @param {string[]} trackUris - e.g. spotify:track:xxx
   * @returns {Promise<void>}
   */
  async function addTracksToPlaylist(accessToken, playlistId, trackUris) {
    const maxPerRequest = 100;
    for (let i = 0; i < trackUris.length; i += maxPerRequest) {
      const chunk = trackUris.slice(i, i + maxPerRequest);
      await api(accessToken, `/playlists/${playlistId}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ uris: chunk })
      });
    }
  }

  /**
   * Get current playlist track URIs (to avoid duplicates).
   * @param {string} accessToken
   * @param {string} playlistId
   * @returns {Promise<Set<string>>}
   */
  async function getPlaylistTrackIds(accessToken, playlistId) {
    const ids = new Set();
    let url = `/playlists/${playlistId}/tracks?limit=100&fields=items(track(id))`;
    while (url) {
      const data = await api(accessToken, url);
      const items = data.items || [];
      for (const it of items) {
        if (it.track && it.track.id) ids.add(it.track.id);
      }
      url = data.next ? data.next.replace(SPOTIFY_API_BASE, '') : null;
    }
    return ids;
  }

  return {
    getStoredToken,
    storeTokens,
    clearTokens,
    login,
    getValidToken,
    api,
    getPlaylists,
    getPlaylistTracks,
    addTracksToPlaylist,
    getPlaylistTrackIds
  };
})();

if (typeof self !== 'undefined') self.BridgeSpotify = Spotify;
if (typeof window !== 'undefined') window.BridgeSpotify = Spotify;
