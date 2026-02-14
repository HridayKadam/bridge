/**
 * Bridge - Firebase Analytics (Firestore)
 * Tracks: user email, playlist name, number of songs transferred, timestamp.
 */

const BridgeFirebase = (function () {
  'use strict';

  let initialized = false;
  let db = null;
  let auth = null;

  /**
   * Initialize Firebase if config is present.
   * @param {object} config - window.BRIDGE_CONFIG.FIREBASE
   * @returns {Promise<boolean>}
   */
  async function init(config) {
    if (initialized && db) return true;
    if (!config || !config.apiKey || config.apiKey.startsWith('YOUR_')) {
      return false;
    }
    try {
      if (typeof firebase === 'undefined' || !firebase.app) {
        return false;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      db = firebase.firestore();
      auth = firebase.auth();
      initialized = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Get current user email (from Firebase Auth or pass from Google token).
   * @param {string} email - Optional; if not set we don't have Firebase Auth, use provided.
   * @returns {Promise<string|null>}
   */
  async function getUserEmail(email) {
    if (email) return email;
    if (!auth) return null;
    const user = auth.currentUser;
    return user ? user.email : null;
  }

  /**
   * Log a transfer to Firestore (transfers collection).
   * @param {object} params
   * @param {string} [params.userEmail]
   * @param {string} params.playlistName
   * @param {number} params.songsTransferred
   * @param {string} [params.direction] - e.g. 'spotify_to_youtube'
   * @returns {Promise<void>}
   */
  async function logTransfer(params) {
    if (!db) return;
    try {
      const doc = {
        userEmail: params.userEmail || null,
        playlistName: params.playlistName || '',
        songsTransferred: params.songsTransferred || 0,
        direction: params.direction || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('transfers').add(doc);
    } catch (_) {
      // Fail silently for analytics
    }
  }

  return {
    init,
    getUserEmail,
    logTransfer,
    get initialized() {
      return initialized;
    }
  };
})();

if (typeof window !== 'undefined') {
  window.BridgeFirebase = BridgeFirebase;
}
