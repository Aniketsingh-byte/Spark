/* ==========================================================================
   cart.js  -  Cart logic + the slide-out cart drawer.
   Used by index.html (to add products) and checkout.html (to read the order).
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.cart = (function () {
  'use strict';

  var $ = Spark.util.$, $$ = Spark.util.$$;

  /* Promo codes the store accepts.
     type: "percent" = % of subtotal, "flat" = fixed amount, "shipping" = free delivery */
  var COUPONS = {
    SPARK10: { type: 'percent', value: 10, label: '10% off your order' },
    LEARN20: { type: 'percent', value: 20, label: '20% off your order' },
    WELCOME5: { type: 'flat', value: 5, label: '$5 off your order' },
    FREESHIP: { type: 'shipping', value: 0, label: 'Free shipping' }
  };

  /* ---------------------------- Cart contents -------------------------- */
  function items() { return Spark.db.getCart(); }

  function count() {
    return items().reduce(function (sum, it) { return sum + (Number(it.qty) || 0); }, 0);
  }

  function lineProduct(id) { return Spark.catalog.find(id); }

  /**
   * Add a product to the cart (or increase its quantity).
   * @return {Object} { ok: boolean, message: string }
   */
  function add(productId, qty) {
    var product = lineProduct(productId);
    if (!product) return { ok: false, message: 'Product not found.' };
    if (product.stock <= 0) return { ok: false, message: product.name + ' is out of stock.' };

    var amount = Number(qty) || 1;
    var cart = items();
    var found = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].productId === productId) { found = cart[i]; break; }
    }

    var current = found ? found.qty : 0;
    var wanted = current + amount;

    if (wanted > product.stock) {
      wanted = product.stock;
      if (current === product.stock) {
        return { ok: false, message: 'Only ' + product.stock + ' left in stock.' };
      }
    }

    if (found) {
      found.qty = wanted;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        emoji: product.emoji,
        price: product.price,
        qty: wanted
      });
    }

    Spark.db.setCart(cart);
    return { ok: true, message: product.name + ' added to cart.' };
  }

  function setQty(productId, qty) {
    var cart = items();
    var amount = Number(qty) || 0;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].productId !== productId) continue;
      if (amount <= 0) { cart.splice(i, 1); }
      else {
        var product = lineProduct(productId);
        cart[i].qty = (product && product.stock > 0) ? Math.min(amount, product.stock) : amount;
      }
      break;
    }
    Spark.db.setCart(cart);
    return cart;
  }

  function remove(productId) { return setQty(productId, 0); }

  function clear() { Spark.db.clearCart(); }

  /* ------------------------------ Coupons ----------------------------- */
  /** @return {Object} { ok, message } */
  function applyCoupon(code) {
    var clean = String(code || '').trim().toUpperCase();
    if (!clean) return { ok: false, message: 'Enter a code first.' };

    var def = COUPONS[clean];
    if (!def) return { ok: false, message: '"' + clean + '" is not a valid code.' };

    if (!items().length) return { ok: false, message: 'Add something to your cart first.' };

    Spark.db.setCoupon({ code: clean });
    return { ok: true, message: def.label + ' applied!' };
  }

  function removeCoupon() { Spark.db.setCoupon(null); }

  function activeCoupon() {
    var saved = Spark.db.getCoupon();
    if (!saved || !COUPONS[saved.code]) return null;
    return { code: saved.code, label: COUPONS[saved.code].label, type: COUPONS[saved.code].type };
  }

  /* ------------------------------ Totals ------------------------------ */
  /** Every money value for the current cart, including tax and shipping. */
  function totals() {
    var cart = items();
    var coupon = activeCoupon();
    var subtotal = cart.reduce(function (sum, it) {
      return sum + (Number(it.price) || 0) * (Number(it.qty) || 0);
    }, 0);

    var discount = 0;
    var freeShipping = false;
    if (coupon) {
      var def = COUPONS[coupon.code];
      if (def.type === 'percent') discount = subtotal * def.value / 100;
      else if (def.type === 'flat') discount = def.value;
      else if (def.type === 'shipping') freeShipping = true;
    }

    var t = Spark.db.calcTotals(cart, discount, freeShipping);
    t.coupon = coupon;
    t.count = count();
    return t;
  }

  /* ============================ DRAWER UI ============================= */
  function lineHtml(line) {
    var e = Spark.util.escapeHtml;
    var money = Spark.util.money;
    var product = lineProduct(line.productId);
    var img = product ? Spark.util.thumb(product.emoji, product.c1, product.c2) : '';

    return '<div class="line">' +
        '<img class="line__img" src="' + img + '" alt="' + e(line.name) + '">' +
        '<div>' +
          '<div class="line__name">' + e(line.name) + '</div>' +
          '<div class="line__meta">' + money(line.price) + ' each</div>' +
          '<div class="qty">' +
            '<button type="button" data-act="dec" data-id="' + e(line.productId) + '" aria-label="Decrease quantity">&minus;</button>' +
            '<span>' + line.qty + '</span>' +
            '<button type="button" data-act="inc" data-id="' + e(line.productId) + '" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="line__right">' +
          '<div class="line__total">' + money(line.price * line.qty) + '</div>' +
          '<button class="link-btn link-btn--danger" type="button" data-act="remove" data-id="' +
            e(line.productId) + '">Remove</button>' +
        '</div>' +
      '</div>';
  }

  /** Redraw the badge, the drawer contents and every money figure. */
  function render() {
    var body = $('#cartBody');
    var cart = items();
    var t = totals();

    if (body) {
      if (!cart.length) {
        body.innerHTML =
          '<div class="empty" style="border:0;padding:30px 8px">' +
            '<div class="empty__icon">&#128722;</div>' +
            '<h3 style="margin-bottom:4px">Your cart is empty</h3>' +
            '<p class="muted small">Browse the catalogue and add something you like.</p>' +
          '</div>';
      } else {
        body.innerHTML = cart.map(lineHtml).join('');
      }
    }

    var badge = $('#cartCount');
    if (badge) badge.textContent = t.count;

    var drawerCount = $('#drawerCount');
    if (drawerCount) {
      drawerCount.textContent = t.count ? '(' + t.count + ' item' + (t.count === 1 ? '' : 's') + ')' : '';
    }

    setText('#cartSubtotal', t.subtotal);
    setText('#cartShipping', t.shipping);
    setText('#cartTax', t.tax);
    setText('#cartTotal', t.total);
    return t;
  }

  function setText(selector, amount) {
    var el = $(selector);
    if (el) el.textContent = Spark.util.money(amount);
  }

  function openDrawer() {
    var drawer = $('#cartDrawer');
    if (!drawer) return;
    render();
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    var drawer = $('#cartDrawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* Wire up every cart button on the page. Called once per page load. */
  function init() {
    var openBtn = $('#cartButton');
    if (openBtn) openBtn.addEventListener('click', openDrawer);

    $$('[data-close-cart]').forEach(function (el) {
      el.addEventListener('click', closeDrawer);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeDrawer();
    });

    // One listener handles every "+", "-" and "Remove" click in the drawer.
    var body = $('#cartBody');
    if (body) {
      body.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-act]');
        if (!btn) return;

        var id = btn.getAttribute('data-id');
        var act = btn.getAttribute('data-act');
        var current = 0;
        items().forEach(function (it) { if (it.productId === id) current = it.qty; });

        if (act === 'inc') Spark.cart.setQty(id, current + 1);
        else if (act === 'dec') Spark.cart.setQty(id, current - 1);
        else if (act === 'remove') Spark.cart.remove(id);

        render();
      });
    }

    // Warn (once) if the browser refuses to persist data.
    var hint = $('#storageHint');
    if (hint && !Spark.db.isPersistent()) {
      hint.style.display = 'block';
      hint.innerHTML = '&#9888; This browser is blocking local storage, so the cart and sales ' +
        'will only last for this page view. Serve the folder from a local web server for full persistence.';
    }

    render();
  }

  return {
    COUPONS: COUPONS,
    items: items,
    count: count,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    applyCoupon: applyCoupon,
    removeCoupon: removeCoupon,
    activeCoupon: activeCoupon,
    totals: totals,
    /* drawer UI */
    render: render,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    init: init
  };
})();