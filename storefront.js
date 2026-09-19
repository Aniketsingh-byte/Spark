/* ==========================================================================
   storefront.js  -  Product-selling UI (index.html only).
   Renders the catalogue, the category chips, the live search, the sort
   drop-down and the "Add to cart" buttons.
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.storefront = (function () {
  'use strict';

  var $ = Spark.util.$, $$ = Spark.util.$$;

  var state = { category: 'All', query: '', sort: 'featured' };

  /* ------------------------- 1. Render the chips ----------------------- */
  function renderChips() {
    var host = $('#categoryChips');
    if (!host) return;

    var cats = ['All'].concat(Spark.catalog.categories());
    host.innerHTML = cats.map(function (cat) {
      var active = (state.category === cat) ? ' is-active' : '';
      var safe = Spark.util.escapeHtml(cat);
      return '<button class="chip' + active + '" type="button" data-cat="' + safe + '">' + safe + '</button>';
    }).join('');
  }

  /* --------------------- 2. Filter + sort products --------------------- */
  function visibleProducts() {
    var list = Spark.catalog.all();
    var q = state.query.trim().toLowerCase();

    if (state.category !== 'All') {
      list = list.filter(function (p) { return p.category === state.category; });
    }
    if (q) {
      list = list.filter(function (p) {
        return (p.name + ' ' + p.category).toLowerCase().indexOf(q) !== -1;
      });
    }

    switch (state.sort) {
      case 'price-asc':  list.sort(function (a, b) { return a.price - b.price; }); break;
      case 'price-desc': list.sort(function (a, b) { return b.price - a.price; }); break;
      case 'rating':     list.sort(function (a, b) { return b.rating - a.rating; }); break;
      case 'name':       list.sort(function (a, b) { return a.name.localeCompare(b.name); }); break;
      default: break;   // "featured" keeps the catalogue order
    }
    return list;
  }

  /** 4.5 -> "\u2605\u2605\u2605\u2605\u2606" style star string. */
  function starsFor(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5;
    var out = '';
    for (var i = 0; i < full; i++) out += '\u2605';
    if (half) out += '\u2606';
    while (out.length < 5) out += '\u2606';
    return out;
  }

  /* ------------------------ 3. Result line text ------------------------ */
  function renderResultLine() {
    var line = $('#resultLine');
    if (!line) return;
    var n = visibleProducts().length;
    var parts = [n + ' product' + (n === 1 ? '' : 's')];
    if (state.category !== 'All') parts.push('in ' + state.category);
    if (state.query.trim()) parts.push('matching "' + state.query.trim() + '"');
    line.textContent = 'Showing ' + parts.join(' ');
  }

  /* --------------------- 4. Hero counters (from sales) ----------------- */
  function renderHeroStats() {
    var s = Spark.db.stats();
    var rev = $('#heroRevenue'), ord = $('#heroOrders'), prod = $('#heroProducts');
    if (rev) rev.textContent = Spark.util.money(s.revenue);
    if (ord) ord.textContent = s.orders;
    if (prod) prod.textContent = Spark.catalog.all().length;
  }

  /* -------------------------- 5. Render cards -------------------------- */
  function renderGrid() {
    var grid = $('#productGrid');
    var tpl = $('#tplProductCard');
    if (!grid || !tpl) return;

    var list = Spark.storefront.visibleProducts();
    var money = Spark.util.money;
    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML =
        '<div class="empty">' +
          '<div class="empty__icon">&#128269;</div>' +
          '<h3>No products match your search</h3>' +
          '<p class="muted">Try a different keyword, or clear the category filter.</p>' +
          '<button class="btn btn--sm" type="button" id="resetFiltersBtn">Reset filters</button>' +
        '</div>';
      return;
    }

    var frag = document.createDocumentFragment();

    list.forEach(function (p) {
      var card = tpl.content.firstElementChild.cloneNode(true);
      var onSale = p.oldPrice && p.oldPrice > p.price;
      var lowStock = p.stock > 0 && p.stock <= Spark.db.SETTINGS.lowStockAt;

      var img = card.querySelector('.js-img');
      img.src = Spark.util.thumb(p.emoji, p.c1, p.c2);
      img.alt = p.name;

      card.querySelector('.js-cat').textContent = p.category;
      card.querySelector('.js-title').textContent = p.name;
      card.querySelector('.js-stars').textContent = Spark.storefront.starsFor(p.rating);
      card.querySelector('.js-reviews').textContent = p.rating.toFixed(1) + ' (' + p.reviews + ')';

      if (onSale) {
        var off = Math.round((1 - p.price / p.oldPrice) * 100);
        var saleTag = card.querySelector('.js-sale');
        saleTag.classList.remove('hidden');
        saleTag.textContent = '-' + off + '%';
      }

      var stockBadge = card.querySelector('.js-stock');
      if (p.stock <= 0) {
        stockBadge.className = 'badge badge--danger js-stock';
        stockBadge.textContent = 'Out of stock';
        card.querySelector('.js-oos').classList.remove('hidden');
      } else if (lowStock) {
        stockBadge.className = 'badge badge--warn js-stock';
        stockBadge.textContent = 'Only ' + p.stock + ' left';
      } else {
        stockBadge.className = 'badge badge--ok js-stock';
        stockBadge.textContent = 'In stock';
      }

      card.querySelector('.js-price').innerHTML = money(p.price) +
        (onSale ? ' <del>' + money(p.oldPrice) + '</del>' : '');

      var addBtn = card.querySelector('.js-add');
      addBtn.setAttribute('data-id', p.id);
      if (p.stock <= 0) {
        addBtn.disabled = true;
        addBtn.textContent = 'Sold out';
      }

      frag.appendChild(card);
    });

    grid.appendChild(frag);
  }

  function refresh() {
    renderGrid();
    Spark.storefront.renderResultLine();
  }

  /* ------------------------- 6. Event wiring --------------------------- */
  function init() {
    Spark.cart.init();
    Spark.storefront.renderChips();
    refresh();
    Spark.storefront.renderHeroStats();

    // Category chips
    var chipHost = $('#categoryChips');
    if (chipHost) {
      chipHost.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.chip');
        if (!btn) return;
        Spark.storefront.state.category = btn.getAttribute('data-cat');
        $$('.chip', chipHost).forEach(function (c) { c.classList.remove('is-active'); });
        btn.classList.add('is-active');
        refresh();
      });
    }

    // Live search (debounced so typing stays smooth)
    var search = $('#searchInput');
    if (search) {
      search.addEventListener('input', Spark.util.debounce(function () {
        Spark.storefront.state.query = search.value;
        refresh();
      }, 180));
    }

    // Sort drop-down
    var sort = $('#sortSelect');
    if (sort) {
      sort.addEventListener('change', function () {
        Spark.storefront.state.sort = sort.value;
        refresh();
      });
    }

    // Add-to-cart + reset-filters (delegated, so re-rendered cards still work)
    var grid = $('#productGrid');
    if (grid) {
      grid.addEventListener('click', function (ev) {
        if (ev.target.closest('#resetFiltersBtn')) {
          var st = Spark.storefront.state;
          st.category = 'All'; st.query = ''; st.sort = 'featured';
          if ($('#searchInput')) $('#searchInput').value = '';
          if ($('#sortSelect')) $('#sortSelect').value = 'featured';
          Spark.storefront.renderChips();
          refresh();
          return;
        }

        var btn = ev.target.closest('.js-add');
        if (!btn) return;

        var result = Spark.cart.add(btn.getAttribute('data-id'), 1);
        Spark.util.toast(result.message, result.ok ? 'ok' : 'err');
        if (result.ok) {
          Spark.cart.render();
          Spark.cart.openDrawer();
        }
      });
    }

    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  }

  return { init: init, refresh: refresh, renderGrid: renderGrid };
})();

/* Scripts are loaded at the end of <body>, but DOMContentLoaded keeps this
   safe no matter where the script tag ends up. */
document.addEventListener('DOMContentLoaded', function () {
  Spark.storefront.init();
});