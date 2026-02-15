/**
 * Bridge - Popup UI logic
 * Single flow: pick source platform + playlist(s), destination platform + playlist, transfer.
 * Spotify↔Spotify and YouTube↔YouTube are not allowed.
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PLATFORM = { SPOTIFY: 'spotify', YOUTUBE: 'youtube' };

  let spotifyToken = null;
  let youtubeToken = null;
  let spotifyPlaylists = [];
  let youtubePlaylists = [];
  let sourcePlatform = '';
  let destPlatform = '';

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
      await loadSpotifyPlaylistsSafe();
      refreshSourceAndDestPlaylists();
      updateValidationAndTransfer();
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
    refreshSourceAndDestPlaylists();
    updateValidationAndTransfer();
  }

  async function youtubeLogin() {
    hideMessage();
    try {
      const r = await send('YOUTUBE_TOKEN');
      youtubeToken = r.token;
      updateAuthUI();
      await loadYoutubePlaylistsSafe();
      refreshSourceAndDestPlaylists();
      updateValidationAndTransfer();
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
    refreshSourceAndDestPlaylists();
    updateValidationAndTransfer();
  }

  async function loadSpotifyPlaylistsSafe() {
    if (!spotifyToken) return;
    try {
      const r = await send('SPOTIFY_PLAYLISTS', { token: spotifyToken });
      spotifyPlaylists = r.playlists || [];
    } catch (e) {
      spotifyPlaylists = [];
      showMessage('Failed to load Spotify playlists: ' + (e.message || 'Unknown error'), true);
    }
  }

  async function loadYoutubePlaylistsSafe() {
    if (!youtubeToken) return;
    try {
      const r = await send('YOUTUBE_PLAYLISTS', { token: youtubeToken });
      youtubePlaylists = r.playlists || [];
    } catch (e) {
      youtubePlaylists = [];
      const msg = (e && e.message) || '';
      const isHtml = /<\s*html|<!DOCTYPE/i.test(msg);
      showMessage('Failed to load YouTube playlists.' + (isHtml ? ' Check that YouTube Data API v3 is enabled.' : ' ' + msg), true);
    }
  }

  function getSourcePlaylists() {
    if (sourcePlatform === PLATFORM.SPOTIFY) return spotifyPlaylists;
    if (sourcePlatform === PLATFORM.YOUTUBE) return youtubePlaylists;
    return [];
  }

  function getSourcePlaylistName(playlistId) {
    const list = getSourcePlaylists();
    const p = list.find((x) => x.id === playlistId);
    return (p && p.name) ? p.name : 'Playlist';
  }

  function fillSelectSingle(selectEl, items, placeholder, valueKey = 'id', labelKey = 'name', emptyPlaceholder = 'No playlists found') {
    const current = selectEl.value;
    selectEl.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = items.length === 0 ? emptyPlaceholder : placeholder;
    if (items.length === 0) opt0.disabled = true;
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

  function fillSelectMulti(selectEl, items, valueKey = 'id', labelKey = 'name', emptyPlaceholder = 'No playlists found') {
    const selected = Array.from(selectEl.selectedOptions).map((o) => o.value);
    selectEl.innerHTML = '';
    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = emptyPlaceholder;
      opt.disabled = true;
      selectEl.appendChild(opt);
    } else {
      for (const it of items) {
        const opt = document.createElement('option');
        opt.value = it[valueKey];
        opt.textContent = it[labelKey] || it[valueKey];
        opt.selected = selected.includes(it[valueKey]);
        selectEl.appendChild(opt);
      }
    }
  }

  function getSelectedSourcePlaylistIds() {
    const select = $('source-playlist');
    return Array.from(select.selectedOptions)
      .map((o) => o.value)
      .filter(Boolean);
  }

  function showValidation(msg) {
    const el = $('validation-msg');
    el.textContent = msg || '';
    el.className = 'validation-msg ' + (msg ? 'error' : '');
    el.classList.toggle('hidden', !msg);
  }

  function updateValidationAndTransfer() {
    sourcePlatform = ($('source-platform').value || '').trim();
    destPlatform = ($('dest-platform').value || '').trim();
    const samePlatform = sourcePlatform && destPlatform && sourcePlatform === destPlatform;
    if (samePlatform) {
      showValidation('Source and destination must be different (e.g. Spotify → YouTube or YouTube → Spotify).');
      $('transfer-btn').disabled = true;
      return;
    }
    showValidation('');

    const hasSourceToken = sourcePlatform === PLATFORM.SPOTIFY ? spotifyToken : sourcePlatform === PLATFORM.YOUTUBE ? youtubeToken : false;
    const hasDestToken = destPlatform === PLATFORM.SPOTIFY ? spotifyToken : destPlatform === PLATFORM.YOUTUBE ? youtubeToken : false;
    const sourceIds = getSelectedSourcePlaylistIds();

    const canTransfer =
      sourcePlatform &&
      destPlatform &&
      !samePlatform &&
      hasSourceToken &&
      hasDestToken &&
      sourceIds.length > 0;
    $('transfer-btn').disabled = !canTransfer;
  }

  function refreshSourceAndDestPlaylists() {
    const srcList = getSourcePlaylists();
    if (sourcePlatform === PLATFORM.SPOTIFY || sourcePlatform === PLATFORM.YOUTUBE) {
      fillSelectMulti($('source-playlist'), srcList, 'id', 'name', 'No playlists found');
      $('source-empty-msg').classList.toggle('hidden', srcList.length > 0);
    } else {
      fillSelectMulti($('source-playlist'), [], 'id', 'name', 'Select platform first');
      $('source-empty-msg').classList.add('hidden');
    }
    $('source-playlist').disabled = !sourcePlatform || (sourcePlatform === PLATFORM.SPOTIFY && !spotifyToken) || (sourcePlatform === PLATFORM.YOUTUBE && !youtubeToken);
    updateValidationAndTransfer();
  }

  async function onSourcePlatformChange() {
    sourcePlatform = ($('source-platform').value || '').trim();
    $('source-playlist').disabled = !sourcePlatform || (sourcePlatform === PLATFORM.SPOTIFY && !spotifyToken) || (sourcePlatform === PLATFORM.YOUTUBE && !youtubeToken);
    if (sourcePlatform === PLATFORM.SPOTIFY && spotifyPlaylists.length === 0 && spotifyToken) {
      fillSelectMulti($('source-playlist'), [], 'id', 'name');
      $('source-empty-msg').classList.add('hidden');
      await loadSpotifyPlaylistsSafe();
    } else if (sourcePlatform === PLATFORM.YOUTUBE && youtubePlaylists.length === 0 && youtubeToken) {
      fillSelectMulti($('source-playlist'), [], 'id', 'name');
      $('source-empty-msg').classList.add('hidden');
      await loadYoutubePlaylistsSafe();
    }
    refreshSourceAndDestPlaylists();
  }

  function onDestPlatformChange() {
    destPlatform = ($('dest-platform').value || '').trim();
    updateValidationAndTransfer();
  }

  async function doTransfer() {
    const srcIds = getSelectedSourcePlaylistIds();
    if (!srcIds.length || sourcePlatform === destPlatform) return;
    hideMessage();
    showValidation('');

    const queryForTrack = (t) => `${t.title} ${t.artist} official audio`.trim() || 'music';
    let totalTransferred = 0;
    let totalFailed = 0;
    const playlistCount = srcIds.length;

    try {
      for (let pIndex = 0; pIndex < srcIds.length; pIndex++) {
        const playlistId = srcIds[pIndex];
        const playlistName = getSourcePlaylistName(playlistId);

        let tracks = [];
        if (sourcePlatform === PLATFORM.SPOTIFY) {
          const r = await send('SPOTIFY_PLAYLIST_TRACKS', { token: spotifyToken, playlistId });
          tracks = (r.tracks || []).map((t) => ({ title: t.title, artist: t.artist, id: t.id }));
        } else {
          const r = await send('YOUTUBE_PLAYLIST_TRACKS', { token: youtubeToken, playlistId });
          tracks = (r.tracks || []).map((t) => ({ title: t.title, artist: t.artist, id: t.videoId }));
        }

        if (tracks.length === 0) {
          totalFailed += 1;
          continue;
        }

        let destPlaylistId;
        if (destPlatform === PLATFORM.SPOTIFY) {
          const r = await send('SPOTIFY_CREATE_PLAYLIST', { token: spotifyToken, name: playlistName });
          destPlaylistId = r.playlistId;
        } else {
          destPlaylistId = await send('YOUTUBE_CREATE_PLAYLIST', { token: youtubeToken, title: playlistName }).then((r) => r.playlistId);
        }
        if (!destPlaylistId) {
          showMessage('Failed to create destination playlist: ' + playlistName, true);
          setProgress(false);
          return;
        }

        const total = tracks.length;
        let transferred = 0;
        let failed = 0;
        const existingIds = new Set();

        for (let i = 0; i < tracks.length; i++) {
          const t = tracks[i];
          const progressLabel = playlistCount > 1 ? `Playlist ${pIndex + 1}/${playlistCount}: ${i + 1}/${total}` : `${i + 1} / ${total}`;
          setProgress(true, ((pIndex * 100 + ((i + 1) / total) * 100) / playlistCount), progressLabel);

          if (destPlatform === PLATFORM.YOUTUBE) {
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
        totalTransferred += transferred;
        totalFailed += failed;
      }

      setProgress(false);
      if (totalFailed === 0) {
        showMessage(playlistCount > 1 ? `Done. ${playlistCount} playlist(s) created, ${totalTransferred} track(s) transferred.` : `Done. "${getSourcePlaylistName(srcIds[0])}" created with ${totalTransferred} track(s).`);
      } else {
        showMessage(`Done. ${totalTransferred} transferred, ${totalFailed} failed.`, true);
      }
    } catch (e) {
      setProgress(false);
      const msg = (e && e.message) || 'Unknown error';
      const isHtml = /<\s*html|<!DOCTYPE/i.test(msg);
      const is403 = /403|Forbidden/i.test(msg);
      if (is403) {
        showMessage(msg, true);
      } else {
        showMessage('Transfer failed: ' + (isHtml ? 'Check your connection and try again.' : msg), true);
      }
    }
  }

  async function init() {
    spotifyToken = await loadSpotifyToken();
    youtubeToken = await loadYoutubeToken();
    updateAuthUI();

    fillSelectMulti($('source-playlist'), [], 'id', 'name', 'Select platform first');
    $('source-empty-msg').classList.add('hidden');
    showValidation('');

    if (spotifyToken) await loadSpotifyPlaylistsSafe();
    if (youtubeToken) await loadYoutubePlaylistsSafe();

    refreshSourceAndDestPlaylists();

    $('spotify-login').addEventListener('click', spotifyLogin);
    $('spotify-logout').addEventListener('click', spotifyLogout);
    $('youtube-login').addEventListener('click', youtubeLogin);
    $('youtube-logout').addEventListener('click', youtubeLogout);

    $('source-platform').addEventListener('change', onSourcePlatformChange);
    $('dest-platform').addEventListener('change', onDestPlatformChange);
    $('source-playlist').addEventListener('change', updateValidationAndTransfer);

    $('transfer-btn').addEventListener('click', doTransfer);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
