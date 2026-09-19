/* ==========================================================================
   util.js  -  Shared helpers used by every page.
   Loaded first on every page. Creates the global "Spark" namespace so the
   other scripts can attach themselves to it.
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.util = (function () {
  'use strict';

  /* --- Tiny DOM helpers ------------------------------------------------- */
  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }
  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* --- Money / date formatting ------------------------------------------ */
  function money(value) {
    var n = Number(value) || 0;
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function dayKey(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* --- Security: never inject raw user text into innerHTML ------------- */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --- Generate an inline SVG image so the site works 100% offline ----- */
  /* (no network requests => no broken image icons)                        */

  /** Turn "&#127911;" into the real character (needed for SVG data URIs,
      because entities are only decoded inside HTML). */
  function decodeEntities(text) {
    return String(text || '').replace(/&#(\d+);/g, function (match, code) {
      var n = Number(code);
      if (n > 0xFFFF) {              // emoji live above the BMP -> surrogate pair
        n -= 0x10000;
        return String.fromCharCode(0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF));
      }
      return String.fromCharCode(n);
    });
  }

  function thumb(emoji, colorA, colorB) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + colorA + '"/>' +
      '<stop offset="1" stop-color="' + colorB + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="400" height="300" fill="url(#g)"/>' +
      '<text x="200" y="186" font-size="130" text-anchor="middle">' +
        decodeEntities(emoji) + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* --- Small UX niceties ------------------------------------------------ */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 250);
    };
  }

  function toast(message, type) {
    var host = $('#toastHost');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.setAttribute('role', 'status');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.classList.add('is-in'); }, 10);
    setTimeout(function () {
      el.classList.remove('is-in');
      setTimeout(function () { el.remove(); }, 300);
    }, 2600);
  }

  /* "SP-2026-0007" style order numbers */
  function pad(num, size) {
    var s = String(num);
    while (s.length < (size || 4)) s = '0' + s;
    return s;
  }

  return {
    $: $, $$: $$,
    money: money,
    formatDate: formatDate,
    dayKey: dayKey,
    escapeHtml: escapeHtml,
    decodeEntities: decodeEntities,
    thumb: thumb,
    debounce: debounce,
    toast: toast,
    pad: pad
  };
})();