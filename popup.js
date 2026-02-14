/**
 * Bridge - Popup UI logic
 * Orchestrates login, playlist loading, and transfer with progress.
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const SOURCE = { SPOTIFY: 'spotify', YOUTUBE: 'youtube' };
  let spotifyToken = null;
  let youtubeToken = null;
  let spotifyPlaylists = [];
  let youtubePlaylists = [];
  let sourceKind = null;
  let destKind = null;

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && !response.success) {
          reject(new Error(response.error || 'Request failed'));
          return;
        }
        resolve(response);
      });
    });
  }

  function showMessage(text, isError = false) {
    const el = $('message');
    el.textContent = text;
    el.className = 'message ' + (isError ? 'error' : 'success');
    el.classList.remove('hidden');
  }

  function hideMessage() {
    $('message').classList.add('hidden');
  }

  function setProgress(visible, percent, text) {
    const wrap = $('progress-wrap');
    const fill = $('progress-fill');
    const txt = $('progress-text');
    if (visible) {
      wrap.classList.remove('hidden');
      fill.style.width = (percent || 0) + '%';
      txt.textContent = text || '0 / 0';
    } else {
      wrap.classList.add('hidden');
    }
  }

  async function loadSpotifyToken() {
    const config = window.BRIDGE_CONFIG || {};
    const clientId = config.SPOTIFY_CLIENT_ID || 'YOUR_SPOTIFY_CLIENT_ID';
    const r = await send('SPOTIFY_GET_TOKEN', { clientId });
    return r.token || null;
  }

  async function loadYoutubeToken() {
    try {
      const r = await send('YOUTUBE_TOKEN');
      return r.token || null;
    } catch (_) {
      return null;
    }
  }

  function updateAuthUI() {
    const spotifyLogin = $('spotify-login');
    const spotifyLogout = $('spotify-logout');
    const spotifyStatus = $('spotify-status');
    const youtubeLogin = $('youtube-login');
    const youtubeLogout = $('youtube-logout');
    const youtubeStatus = $('youtube-status');

    if (spotifyToken) {
      spotifyLogin.classList.add('hidden');
      spotifyLogout.classList.remove('hidden');
      spotifyStatus.textContent = 'Logged in';
      spotifyStatus.classList.remove('error');
    } else {
      spotifyLogin.classList.remove('hidden');
      spotifyLogout.classList.add('hidden');
      spotifyStatus.textContent = '';
    }

    if (youtubeToken) {
      youtubeLogin.classList.add('hidden');
      youtubeLogout.classList.remove('hidden');
      youtubeStatus.textContent = 'Logged in';
      youtubeStatus.classList.remove('error');
    } else {
      youtubeLogin.classList.remove('hidden');
      youtubeLogout.classList.add('hidden');
      youtubeStatus.textContent = '';
    }
  }

  async function spotifyLogin() {
    hideMessage();
    const config = window.BRIDGE_CONFIG || {};
    const clientId = config.SPOTIFY_CLIENT_ID || 'YOUR_SPOTIFY_CLIENT_ID';
    try {
      const r = await send('SPOTIFY_LOGIN', { clientId });
      spotifyToken = r.token;
      updateAuthUI();
      await loadSpotifyPlaylists();
    } catch (e) {
      $('spotify-status').textContent = 'Login failed';
      $('spotify-status').classList.add('error');
      showMessage(e.message || 'Spotify login failed', true);
    }
  }

  async function spotifyLogout() {
    await send('SPOTIFY_LOGOUT');
    spotifyToken = null;
    spotifyPlaylists = [];
    updateAuthUI();
    fillSelect($('source-playlist'), [], 'Select source');
    fillSelect($('dest-playlist'), [], 'Select destination');
    updateTransferButtons();
  }

  async function youtubeLogin() {
    hideMessage();
    try {
      const r = await send('YOUTUBE_TOKEN');
      youtubeToken = r.token;
      updateAuthUI();
      await loadYoutubePlaylists();
    } catch (e) {
      $('youtube-status').textContent = 'Login failed';
      $('youtube-status').classList.add('error');
      showMessage(e.message || 'YouTube login failed', true);
    }
  }

  async function youtubeLogout() {
    await send('YOUTUBE_LOGOUT');
    youtubeToken = null;
    youtubePlaylists = [];
    updateAuthUI();
    fillSelect($('source-playlist'), [], 'Select source');
    fillSelect($('dest-playlist'), [], 'Select destination');
    updateTransferButtons();
  }

  function fillSelect(selectEl, items, placeholder, valueKey = 'id', labelKey = 'name') {
    const current = selectEl.value;
    selectEl.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder;
    selectEl.appendChild(opt0);
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it[valueKey];
      opt.textContent = it[labelKey] || it[valueKey];
      selectEl.appendChild(opt);
    }
    if (items.some((it) => it[valueKey] === current)) {
      selectEl.value = current;
    }
  }

  async function loadSpotifyPlaylists() {
    if (!spotifyToken) return;
    try {
      const r = await send('SPOTIFY_PLAYLISTS', { token: spotifyToken });
      spotifyPlaylists = r.playlists || [];
    } catch (_) {
      spotifyPlaylists = [];
    }
  }

  async function loadYoutubePlaylists() {
    if (!youtubeToken) return;
    try {
      const r = await send('YOUTUBE_PLAYLISTS', { token: youtubeToken });
      youtubePlaylists = r.playlists || [];
    } catch (_) {
      youtubePlaylists = [];
    }
  }

  function getSourcePlaylistSelect() {
    return sourceKind === SOURCE.SPOTIFY ? spotifyPlaylists : youtubePlaylists;
  }

  function getDestPlaylistSelect() {
    return destKind === SOURCE.SPOTIFY ? spotifyPlaylists : youtubePlaylists;
  }

  function onSourcePlaylistChange() {
    const id = $('source-playlist').value;
    const platform = sourceKind === SOURCE.SPOTIFY ? 'Spotify' : 'YouTube';
    $('source-platform').textContent = id ? platform : '';
    updateTransferButtons();
  }

  function onDestPlaylistChange() {
    const id = $('dest-playlist').value;
    const platform = destKind === SOURCE.SPOTIFY ? 'Spotify' : 'YouTube';
    $('dest-platform').textContent = id ? platform : '';
    updateTransferButtons();
  }

  function setDirection(isSpotifyToYoutube) {
    sourceKind = isSpotifyToYoutube ? SOURCE.SPOTIFY : SOURCE.YOUTUBE;
    destKind = isSpotifyToYoutube ? SOURCE.YOUTUBE : SOURCE.SPOTIFY;
    fillSelect($('source-playlist'), getSourcePlaylistSelect(), 'Select source');
    fillSelect($('dest-playlist'), getDestPlaylistSelect(), 'Select destination');
    $('source-platform').textContent = '';
    $('dest-platform').textContent = '';
    $('dir-spotify-youtube').classList.toggle('active', isSpotifyToYoutube);
    $('dir-youtube-spotify').classList.toggle('active', !isSpotifyToYoutube);
    updateTransferButtons();
  }

  function updateTransferButtons() {
    const srcId = $('source-playlist').value;
    const destId = $('dest-playlist').value;
    const hasSrc = !!srcId;
    const hasDest = !!destId;
    $('transfer-spotify-to-youtube').disabled = !(hasSrc && hasDest && sourceKind === SOURCE.SPOTIFY && destKind === SOURCE.YOUTUBE);
    $('transfer-youtube-to-spotify').disabled = !(hasSrc && hasDest && sourceKind === SOURCE.YOUTUBE && destKind === SOURCE.SPOTIFY);
  }

  async function ensurePlaylistsLoaded() {
    if (sourceKind === SOURCE.SPOTIFY && spotifyPlaylists.length === 0 && spotifyToken) {
      await loadSpotifyPlaylists();
      fillSelect($('source-playlist'), spotifyPlaylists, 'Select source');
    }
    if (sourceKind === SOURCE.YOUTUBE && youtubePlaylists.length === 0 && youtubeToken) {
      await loadYoutubePlaylists();
      fillSelect($('source-playlist'), youtubePlaylists, 'Select source');
    }
    if (destKind === SOURCE.SPOTIFY && spotifyPlaylists.length === 0 && spotifyToken) {
      await loadSpotifyPlaylists();
      fillSelect($('dest-playlist'), spotifyPlaylists, 'Select destination');
    }
    if (destKind === SOURCE.YOUTUBE && youtubePlaylists.length === 0 && youtubeToken) {
      await loadYoutubePlaylists();
      fillSelect($('dest-playlist'), youtubePlaylists, 'Select destination');
    }
  }

  async function transferSpotifyToYoutube() {
    const srcId = $('source-playlist').value;
    const destId = $('dest-playlist').value;
    if (!srcId || !destId || !spotifyToken || !youtubeToken) return;
    await ensurePlaylistsLoaded();
    await runTransfer({
      sourceKind: SOURCE.SPOTIFY,
      destKind: SOURCE.YOUTUBE,
      sourcePlaylistId: srcId,
      destPlaylistId: destId,
      sourcePlaylistName: spotifyPlaylists.find((p) => p.id === srcId)?.name || 'Playlist',
      destPlaylistName: youtubePlaylists.find((p) => p.id === destId)?.name || 'Playlist'
    });
  }

  async function transferYouTubeToSpotify() {
    const srcId = $('source-playlist').value;
    const destId = $('dest-playlist').value;
    if (!srcId || !destId || !spotifyToken || !youtubeToken) return;
    await ensurePlaylistsLoaded();
    await runTransfer({
      sourceKind: SOURCE.YOUTUBE,
      destKind: SOURCE.SPOTIFY,
      sourcePlaylistId: srcId,
      destPlaylistId: destId,
      sourcePlaylistName: youtubePlaylists.find((p) => p.id === srcId)?.name || 'Playlist',
      destPlaylistName: spotifyPlaylists.find((p) => p.id === destId)?.name || 'Playlist'
    });
  }

  async function runTransfer(opts) {
    const { sourceKind: sk, destKind: dk, sourcePlaylistId, destPlaylistId, sourcePlaylistName } = opts;
    hideMessage();
    setProgress(true, 0, '0 / 0');

    let tracks = [];
    try {
      if (sk === SOURCE.SPOTIFY) {
        const r = await send('SPOTIFY_PLAYLIST_TRACKS', { token: spotifyToken, playlistId: sourcePlaylistId });
        tracks = (r.tracks || []).map((t) => ({ title: t.title, artist: t.artist, id: t.id }));
      } else {
        const r = await send('YOUTUBE_PLAYLIST_TRACKS', { token: youtubeToken, playlistId: sourcePlaylistId });
        tracks = (r.tracks || []).map((t) => ({ title: t.title, artist: t.artist, id: t.videoId }));
      }
    } catch (e) {
      setProgress(false);
      showMessage('Failed to load source playlist: ' + (e.message || ''), true);
      return;
    }

    const total = tracks.length;
    if (total === 0) {
      setProgress(false);
      showMessage('No tracks in source playlist.', true);
      return;
    }

    let existingIds = new Set();
    try {
      if (dk === SOURCE.SPOTIFY) {
        const r = await send('SPOTIFY_PLAYLIST_IDS', { token: spotifyToken, playlistId: destPlaylistId });
        existingIds = new Set(r.ids || []);
      } else {
        const r = await send('YOUTUBE_PLAYLIST_VIDEO_IDS', { token: youtubeToken, playlistId: destPlaylistId });
        existingIds = new Set(r.ids || []);
      }
    } catch (_) {
      existingIds = new Set();
    }

    let transferred = 0;
    let failed = 0;
    const queryForTrack = (t) => `${t.title} ${t.artist} official audio`.trim() || 'music';

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      setProgress(true, ((i + 1) / total) * 100, `${i + 1} / ${total}`);

      if (dk === SOURCE.YOUTUBE) {
        const query = queryForTrack(t);
        try {
          const r = await send('YOUTUBE_SEARCH', { token: youtubeToken, query });
          const videoIdToAdd = r.result && r.result.videoId;
          if (!videoIdToAdd) {
            failed++;
            continue;
          }
          if (existingIds.has(videoIdToAdd)) {
            transferred++;
            continue;
          }
          await send('YOUTUBE_ADD_ITEM', { token: youtubeToken, playlistId: destPlaylistId, videoId: videoIdToAdd });
          existingIds.add(videoIdToAdd);
          transferred++;
        } catch (_) {
          failed++;
        }
      } else {
        const query = queryForTrack(t);
        try {
          const res = await fetch('https://api.spotify.com/v1/search?type=track&q=' + encodeURIComponent(query) + '&limit=1', {
            headers: { Authorization: 'Bearer ' + spotifyToken }
          });
          const data = await res.json().catch(() => ({}));
          const item = data.tracks && data.tracks.items && data.tracks.items[0];
          const trackId = item && item.id;
          const trackUri = item && item.uri;
          if (trackId && existingIds.has(trackId)) {
            transferred++;
            continue;
          }
          if (trackUri) {
            await send('SPOTIFY_ADD_TRACKS', { token: spotifyToken, playlistId: destPlaylistId, uris: [trackUri] });
            existingIds.add(trackId);
            transferred++;
          } else {
            failed++;
          }
        } catch (_) {
          failed++;
        }
      }
    }

    setProgress(false);

    const config = window.BRIDGE_CONFIG || {};
    if (config.FIREBASE && window.BridgeFirebase) {
      await window.BridgeFirebase.init(config.FIREBASE);
      await window.BridgeFirebase.logTransfer({
        playlistName: sourcePlaylistName,
        songsTransferred: transferred,
        direction: sk === SOURCE.SPOTIFY ? 'spotify_to_youtube' : 'youtube_to_spotify'
      });
    }

    if (failed === 0) {
      showMessage(`Done. ${transferred} track(s) transferred.`);
    } else {
      showMessage(`Done. ${transferred} transferred, ${failed} failed.`, failed > 0);
    }
  }

  async function init() {
    spotifyToken = await loadSpotifyToken();
    youtubeToken = await loadYoutubeToken();
    updateAuthUI();

    if (spotifyToken) await loadSpotifyPlaylists();
    if (youtubeToken) await loadYoutubePlaylists();

    setDirection(true);
    fillSelect($('source-playlist'), spotifyPlaylists, 'Select source');
    fillSelect($('dest-playlist'), youtubePlaylists, 'Select destination');

    $('spotify-login').addEventListener('click', spotifyLogin);
    $('spotify-logout').addEventListener('click', spotifyLogout);
    $('youtube-login').addEventListener('click', youtubeLogin);
    $('youtube-logout').addEventListener('click', youtubeLogout);

    $('source-playlist').addEventListener('change', onSourcePlaylistChange);
    $('dest-playlist').addEventListener('change', onDestPlaylistChange);

    $('transfer-spotify-to-youtube').addEventListener('click', transferSpotifyToYoutube);
    $('transfer-youtube-to-spotify').addEventListener('click', transferYouTubeToSpotify);
    $('dir-spotify-youtube').addEventListener('click', () => setDirection(true));
    $('dir-youtube-spotify').addEventListener('click', () => setDirection(false));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
