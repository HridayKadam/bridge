/**
 * Bridge - Utility functions
 * PKCE, base64url, and shared helpers.
 */

const Utils = (function () {
  'use strict';

  /**
   * Generate a cryptographically random string for PKCE code_verifier.
   * @param {number} length - Byte length (43-128 for PKCE).
   * @returns {string} Base64url-encoded random string.
   */
  function randomBase64URL(length = 32) {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return base64URLEncode(bytes);
  }

  /**
   * Base64url encode (no padding, URL-safe).
   * @param {Uint8Array|ArrayBuffer} buffer
   * @returns {string}
   */
  function base64URLEncode(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * SHA-256 hash and return base64url (for PKCE code_challenge).
   * @param {string} plain
   * @returns {Promise<string>}
   */
  async function sha256Base64URL(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(hash);
  }

  /**
   * Generate PKCE code_verifier and code_challenge.
   * @returns {Promise<{ codeVerifier: string, codeChallenge: string }>}
   */
  async function generatePKCE() {
    const codeVerifier = randomBase64URL(32);
    const codeChallenge = await sha256Base64URL(codeVerifier);
    return { codeVerifier, codeChallenge };
  }

  /**
   * Escape query string component for use in URL.
   * @param {string} str
   * @returns {string}
   */
  function escapeQuery(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  /**
   * Build URL with query params.
   * @param {string} base
   * @param {Record<string, string>} params
   * @returns {string}
   */
  function buildURL(base, params) {
    const search = Object.entries(params)
      .map(([k, v]) => escapeQuery(k) + '=' + escapeQuery(v))
      .join('&');
    return base + (base.includes('?') ? '&' : '?') + search;
  }

  /**
   * Parse redirect URL fragment or query for OAuth params.
   * @param {string} url
   * @returns {Record<string, string>}
   */
  function parseRedirectParams(url) {
    try {
      const u = new URL(url);
      const source = u.hash || u.search;
      const params = {};
      source
        .replace(/^#?\?/, '')
        .split('&')
        .forEach((pair) => {
          const [key, value] = pair.split('=').map(decodeURIComponent);
          if (key && value) params[key] = value;
        });
      return params;
    } catch (_) {
      return {};
    }
  }

  /**
   * Debounce function calls.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Function}
   */
  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  return {
    randomBase64URL,
    base64URLEncode,
    sha256Base64URL,
    generatePKCE,
    escapeQuery,
    buildURL,
    parseRedirectParams,
    debounce
  };
})();

// Export for use in background (no window in service worker)
if (typeof self !== 'undefined') {
  self.BridgeUtils = Utils;
}
if (typeof window !== 'undefined') {
  window.BridgeUtils = Utils;
}
