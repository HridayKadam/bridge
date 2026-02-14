/**
 * Bridge - Background Service Worker
 * Handles OAuth (Spotify PKCE), API calls, and messaging from popup.
 */

importScripts('utils.js', 'spotify.js', 'youtube.js');

const CONFIG = {
  SPOTIFY_CLIENT_ID: '5502a386fc78420ebec2219f037810aa',
  GOOGLE_CLIENT_ID: '283462681481-n1u3qv8ghs7qnc6v1bi5aclnoghqa7v7.apps.googleusercontent.com'
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const { type, payload } = message || {};

    try {
      switch (type) {
        case 'GET_REDIRECT_URL': {
          sendResponse({ redirectUrl: chrome.identity.getRedirectURL() });
          return;
        }

        case 'SPOTIFY_LOGIN': {
          const redirectUrl = chrome.identity.getRedirectURL();
          const clientId = payload?.clientId || CONFIG.SPOTIFY_CLIENT_ID;
          const token = await self.BridgeSpotify.login(clientId, redirectUrl);
          sendResponse({ success: true, token });
          return;
        }

        case 'SPOTIFY_LOGOUT': {
          self.BridgeSpotify.clearTokens();
          sendResponse({ success: true });
          return;
        }

        case 'SPOTIFY_GET_TOKEN': {
          const redirectUrl = chrome.identity.getRedirectURL();
          const clientId = payload?.clientId || CONFIG.SPOTIFY_CLIENT_ID;
          const token = await self.BridgeSpotify.getValidToken(clientId, redirectUrl);
          sendResponse({ success: true, token });
          return;
        }

        case 'SPOTIFY_PLAYLISTS': {
          const token = payload?.token;
          if (!token) {
            sendResponse({ success: false, error: 'No token' });
            return;
          }
          const playlists = await self.BridgeSpotify.getPlaylists(token);
          sendResponse({ success: true, playlists });
          return;
        }

        case 'SPOTIFY_PLAYLIST_TRACKS': {
          const { token, playlistId } = payload || {};
          if (!token || !playlistId) {
            sendResponse({ success: false, error: 'Missing token or playlistId' });
            return;
          }
          const tracks = await self.BridgeSpotify.getPlaylistTracks(token, playlistId);
          sendResponse({ success: true, tracks });
          return;
        }

        case 'SPOTIFY_ADD_TRACKS': {
          const { token, playlistId, uris } = payload || {};
          if (!token || !playlistId || !uris || !uris.length) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          await self.BridgeSpotify.addTracksToPlaylist(token, playlistId, uris);
          sendResponse({ success: true });
          return;
        }

        case 'SPOTIFY_PLAYLIST_IDS': {
          const { token, playlistId } = payload || {};
          if (!token || !playlistId) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          const ids = await self.BridgeSpotify.getPlaylistTrackIds(token, playlistId);
          sendResponse({ success: true, ids: [...ids] });
          return;
        }

        case 'YOUTUBE_TOKEN': {
          const token = await self.BridgeYouTube.getAuthToken();
          sendResponse({ success: true, token });
          return;
        }

        case 'YOUTUBE_LOGOUT': {
          await self.BridgeYouTube.clearAuth();
          sendResponse({ success: true });
          return;
        }

        case 'YOUTUBE_PLAYLISTS': {
          const token = payload?.token;
          if (!token) {
            sendResponse({ success: false, error: 'No token' });
            return;
          }
          const playlists = await self.BridgeYouTube.getPlaylists(token);
          sendResponse({ success: true, playlists });
          return;
        }

        case 'YOUTUBE_PLAYLIST_TRACKS': {
          const { token, playlistId } = payload || {};
          if (!token || !playlistId) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          const tracks = await self.BridgeYouTube.getPlaylistTracks(token, playlistId);
          sendResponse({ success: true, tracks });
          return;
        }

        case 'YOUTUBE_CREATE_PLAYLIST': {
          const { token, title } = payload || {};
          if (!token || !title) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          const playlistId = await self.BridgeYouTube.createPlaylist(token, title);
          sendResponse({ success: true, playlistId });
          return;
        }

        case 'YOUTUBE_SEARCH': {
          const { token, query } = payload || {};
          if (!token || !query) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          const result = await self.BridgeYouTube.searchFirst(token, query);
          sendResponse({ success: true, result });
          return;
        }

        case 'YOUTUBE_ADD_ITEM': {
          const { token, playlistId, videoId } = payload || {};
          if (!token || !playlistId || !videoId) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          await self.BridgeYouTube.addPlaylistItem(token, playlistId, videoId);
          sendResponse({ success: true });
          return;
        }

        case 'YOUTUBE_PLAYLIST_VIDEO_IDS': {
          const { token, playlistId } = payload || {};
          if (!token || !playlistId) {
            sendResponse({ success: false, error: 'Missing params' });
            return;
          }
          const ids = await self.BridgeYouTube.getPlaylistVideoIds(token, playlistId);
          sendResponse({ success: true, ids: [...ids] });
          return;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: (err && err.message) || String(err) });
    }
  })();
  return true; // Keep channel open for async sendResponse
});
