/* ==========================================================================
   db.js  -  The data layer ("database") for the store.
   ---------------------------------------------------------------------------
   Everything the app remembers lives here: the cart, the applied coupon and
   every single sale.

   It persists to localStorage, a small key/value store built into every
   browser, so data survives page reloads and closing the browser -- with zero
   installation.

   >>> This is the file to change first when you move to a real backend.
   >>> Every function returns a plain JS object, so you can replace the body
   >>> of each one with a `fetch('/api/sales')` call and nothing else breaks.
   >>> See README.md -> "Upgrade path: adding a real server".
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.db = (function () {
  'use strict';

  var KEYS = {
    sales: 'spark.sales.v1',
    cart: 'spark.cart.v1',
    coupon: 'spark.coupon.v1',
    seq: 'spark.seq.v1'
  };

  /* --- 1. Storage adapter ------------------------------------------------
     Tries localStorage. A few browsers block storage on file:// URLs, so we
     transparently fall back to an in-memory object and tell the user.
  ----------------------------------------------------------------------- */
  var memory = {};
  var usingMemory = false;

  function testStorage() {
    try {
      var probe = '__spark_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }
  usingMemory = !testStorage();

  function readRaw(key, fallback) {
    try {
      var raw = usingMemory ? memory[key] : window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[spark.db] could not read "' + key + '"', e);
      return fallback;
    }
  }

  function writeRaw(key, value) {
    var raw = JSON.stringify(value);
    try {
      if (usingMemory) { memory[key] = raw; }
      else { window.localStorage.setItem(key, raw); }
      return true;
    } catch (e) {
      // Storage full / blocked -> degrade to memory so the app never crashes.
      usingMemory = true;
      memory[key] = raw;
      return false;
    }
  }

  function isPersistent() { return !usingMemory; }

  /* --- 2. Business rules: change these to change the maths ------------- */
  var SETTINGS = {
    currency: '$',
    taxRate: 0.08,          // 8% sales tax
    shippingFlat: 9.99,
    freeShippingOver: 150,  // free delivery above this subtotal
    lowStockAt: 10
  };

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /**
   * Work out every money value for a list of cart lines.
   * @param {Array}  items  [{ price, qty }]
   * @param {number} discount  flat reduction decided by the coupon
   * @param {boolean} freeShipping
   */
  function calcTotals(items, discount, freeShipping) {
    var list = items || [];
    var subtotal = list.reduce(function (sum, it) {
      return sum + (Number(it.price) || 0) * (Number(it.qty) || 0);
    }, 0);

    var shipping = (freeShipping || subtotal >= SETTINGS.freeShippingOver || subtotal === 0)
      ? 0 : SETTINGS.shippingFlat;

    var disc = Math.min(Number(discount) || 0, subtotal);   // never below zero
    var taxable = Math.max(0, subtotal - disc);
    var tax = round2(taxable * SETTINGS.taxRate);

    return {
      subtotal: round2(subtotal),
      discount: round2(disc),
      shipping: round2(shipping),
      tax: tax,
      total: round2(taxable + tax + shipping),
      freeShippingOver: SETTINGS.freeShippingOver,
      missingForFreeShipping: Math.max(0, round2(SETTINGS.freeShippingOver - subtotal))
    };
  }

  /* ===================== 3. SALES (the records) ========================
     A "sale" is one completed order. Shape:
     { id, createdAt, status, channel, customer{}, payment{}, items[],
       itemCount, subtotal, discount, shipping, tax, total, note }
  ===================================================================== */
  function listSales() {
    var sales = readRaw(KEYS.sales, []);
    return Array.isArray(sales) ? sales : [];
  }

  function saveAll(sales) { writeRaw(KEYS.sales, sales); }

  function getSale(id) {
    var sales = listSales();
    for (var i = 0; i < sales.length; i++) {
      if (sales[i].id === id) return sales[i];
    }
    return null;
  }

  /** Human-friendly order number: SP-2026-0001 */
  function nextSaleId() {
    var seq = Number(readRaw(KEYS.seq, 0)) + 1;
    writeRaw(KEYS.seq, seq);
    return 'SP-' + new Date().getFullYear() + '-' + Spark.util.pad(seq, 4);
  }

  /**
   * Persist a completed order. This is the heart of "store all the sales".
   * @param  {Object} draft { customer, payment, items, discount, freeShipping, note, channel }
   * @return {Object} the stored sale, including id / totals / timestamp
   */
  function createSale(draft) {
    var rawItems = (draft.items || []).slice();
    if (!rawItems.length) throw new Error('Cannot store a sale with no items.');

    var items = rawItems.map(function (it) {
      var price = round2(it.price);
      var qty = Number(it.qty) || 0;
      return {
        productId: it.productId,
        name: it.name,
        emoji: it.emoji || '',
        price: price,
        qty: qty,
        lineTotal: round2(price * qty)
      };
    }).filter(function (it) { return it.qty > 0; });

    if (!items.length) throw new Error('Cannot store a sale with no items.');

    var totals = calcTotals(items, draft.discount, draft.freeShipping);
    var customer = draft.customer || {};
    var payment = draft.payment || {};

    var sale = {
      id: nextSaleId(),
      createdAt: new Date().toISOString(),
      status: 'completed',                                  // completed | refunded | cancelled
      channel: draft.channel || 'Online store',
      customer: {
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        zip: customer.zip || ''
      },
      payment: {
        method: payment.method || 'card',
        last4: payment.last4 || '',
        reference: payment.reference || '',
        // Cash on delivery is only paid when the parcel arrives.
        status: (payment.method === 'cod') ? 'pending' : 'paid'
      },
      items: items,
      itemCount: items.reduce(function (s, it) { return s + it.qty; }, 0),
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
      note: draft.note || ''
    };

    var sales = listSales();
    sales.unshift(sale);          // newest first
    saveAll(sales);
    return sale;
  }

  function updateSaleStatus(id, status) {
    var allowed = ['completed', 'refunded', 'cancelled'];
    if (allowed.indexOf(status) === -1) return null;

    var sales = listSales();
    for (var i = 0; i < sales.length; i++) {
      if (sales[i].id !== id) continue;
      sales[i].status = status;
      // A refunded or cancelled order is no longer "paid".
      if (status === 'refunded') sales[i].payment.status = 'refunded';
      else if (status === 'cancelled') sales[i].payment.status = 'void';
      else if (sales[i].payment.method !== 'cod') sales[i].payment.status = 'paid';
      else sales[i].payment.status = 'pending';
      saveAll(sales);
      return sales[i];
    }
    return null;
  }

  function deleteSale(id) {
    var kept = listSales().filter(function (s) { return s.id !== id; });
    saveAll(kept);
    return true;
  }

  function clearSales() {
    saveAll([]);
    writeRaw(KEYS.seq, 0);
    return true;
  }

  /* ================= 4. REPORTING (powers the dashboard) ============== */
  /**
   * Build every number the dashboard needs, from the stored sales.
   * @param {Array} [list] optional pre-filtered list of sales
   */
  function stats(list) {
    var sales = list || listSales();

    // Cancelled orders never happened; refunded ones count as orders but no money.
    var valid = sales.filter(function (s) { return s.status !== 'cancelled'; });
    var earning = valid.filter(function (s) { return s.status !== 'refunded'; });

    var revenue = earning.reduce(function (sum, s) { return sum + s.total; }, 0);
    var itemsSold = earning.reduce(function (sum, s) { return sum + s.itemCount; }, 0);
    var pending = sales.filter(function (s) { return s.payment.status === 'pending'; })
      .reduce(function (sum, s) { return sum + s.total; }, 0);

    /* --- revenue per day for the last 7 days (bar chart) --- */
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({
        key: Spark.util.dayKey(d.toISOString()),
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        value: 0
      });
    }
    var byDay = {};
    days.forEach(function (day) { byDay[day.key] = day; });
    earning.forEach(function (s) {
      var key = Spark.util.dayKey(s.createdAt);
      if (byDay[key]) byDay[key].value = round2(byDay[key].value + s.total);
    });

    /* --- best selling products --- */
    var tally = {};
    earning.forEach(function (s) {
      s.items.forEach(function (it) {
        var row = tally[it.productId] || (tally[it.productId] = {
          productId: it.productId, name: it.name, emoji: it.emoji, qty: 0, revenue: 0
        });
        row.qty += it.qty;
        row.revenue = round2(row.revenue + it.lineTotal);
      });
    });
    var topProducts = Object.keys(tally).map(function (k) { return tally[k]; })
      .sort(function (a, b) { return b.revenue - a.revenue; })
      .slice(0, 5);

    /* --- payment method split --- */
    var methods = {};
    earning.forEach(function (s) {
      methods[s.payment.method] = round2((methods[s.payment.method] || 0) + s.total);
    });

    var best = days.slice().sort(function (a, b) { return b.value - a.value; })[0];

    return {
      revenue: round2(revenue),
      orders: valid.length,
      itemsSold: itemsSold,
      avgOrder: valid.length ? round2(revenue / valid.length) : 0,
      pending: round2(pending),
      refundedCount: sales.filter(function (s) { return s.status === 'refunded'; }).length,
      cancelledCount: sales.filter(function (s) { return s.status === 'cancelled'; }).length,
      bestDay: best || null,
      perDay: days,
      topProducts: topProducts,
      methods: methods
    };
  }

  /** Turn the stored sales into a CSV string (for the Export button). */
  function salesToCsv(list) {
    var sales = list || listSales();
    var cols = ['Order ID', 'Date', 'Status', 'Channel', 'Payment method', 'Payment status',
      'Customer', 'Email', 'Phone', 'Address', 'City', 'Zip', 'Items', 'Item count',
      'Subtotal', 'Discount', 'Shipping', 'Tax', 'Total', 'Note'];

    function esc(value) {
      var s = (value === null || value === undefined) ? '' : String(value);
      return '"' + s.replace(/"/g, '""') + '"';
    }

    var rows = [cols.map(esc).join(',')];
    sales.forEach(function (s) {
      rows.push([
        s.id, s.createdAt, s.status, s.channel, s.payment.method, s.payment.status,
        s.customer.name, s.customer.email, s.customer.phone, s.customer.address,
        s.customer.city, s.customer.zip,
        s.items.map(function (i) { return i.name + ' x' + i.qty; }).join(' | '),
        s.itemCount, s.subtotal, s.discount, s.shipping, s.tax, s.total, s.note
      ].map(esc).join(','));
    });
    return rows.join('\r\n');
  }

  /* ======================= 5. CART + COUPON =========================== */
  function getCart() {
    var cart = readRaw(KEYS.cart, []);
    return Array.isArray(cart) ? cart : [];
  }
  function setCart(items) { writeRaw(KEYS.cart, items || []); }
  function clearCart() {
    writeRaw(KEYS.cart, []);
    setCoupon(null);
  }

  /** The coupon currently applied to the cart, e.g. { code: 'SPARK10' }. */
  function getCoupon() { return readRaw(KEYS.coupon, null); }
  function setCoupon(coupon) { writeRaw(KEYS.coupon, coupon || null); }

  /* ===================== 6. DEMO / SAMPLE DATA ======================== */
  /** Fill the dashboard with realistic-looking orders (handy for a demo). */
  function seedDemoSales() {
    var people = [
      ['Aisha Khan', 'aisha.khan@example.com', 'Karachi', '+92 300 1234567'],
      ['Daniel Reyes', 'd.reyes@example.com', 'Austin', '+1 512 555 0134'],
      ['Mei Lin', 'mei.lin@example.com', 'Singapore', '+65 8123 4567'],
      ['Tomas Novak', 't.novak@example.com', 'Prague', '+420 601 234 567'],
      ['Priya Sharma', 'priya.sharma@example.com', 'Delhi', '+91 98110 22334'],
      ["Liam O'Brien", 'liam.obrien@example.com', 'Dublin', '+353 85 123 4567'],
      ['Sofia Rossi', 'sofia.rossi@example.com', 'Milan', '+39 340 123 4567']
    ];
    var methods = ['card', 'upi', 'cod'];
    var catalog = Spark.catalog.all();
    var created = [];

    for (var n = 0; n < people.length; n++) {
      // 1-3 different products per order
      var shuffled = catalog.slice().sort(function () { return Math.random() - 0.5; });
      var picks = shuffled.slice(0, 1 + Math.floor(Math.random() * 3));
      var items = picks.map(function (p) {
        return {
          productId: p.id, name: p.name, emoji: p.emoji, price: p.price,
          qty: 1 + Math.floor(Math.random() * 2)
        };
      });

      var sale = createSale({
        customer: {
          name: people[n][0], email: people[n][1], phone: people[n][3],
          address: (12 + n) + ' Market Street', city: people[n][2], zip: '10' + (100 + n)
        },
        payment: { method: methods[n % methods.length] },
        items: items,
        discount: (n === 3) ? 15 : 0,
        channel: (n % 2) ? 'Online store' : 'Mobile app',
        note: (n === 2) ? 'Gift wrap please' : ''
      });

      // Back-date each order across the last 7 days so the chart has data.
      var when = new Date();
      when.setDate(when.getDate() - (n % 7));
      when.setHours(9 + (n % 8), (n * 7) % 60, 0, 0);
      sale.createdAt = when.toISOString();
      if (n === 5) sale.status = 'refunded';
      created.push(sale);
    }

    // Write the patched timestamps/statuses back, then keep newest first.
    var ids = {};
    created.forEach(function (s) { ids[s.id] = s; });
    var all = listSales().map(function (s) { return ids[s.id] || s; });
    all.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    saveAll(all);

    return created.length;
  }

  return {
    KEYS: KEYS,
    SETTINGS: SETTINGS,
    isPersistent: isPersistent,
    calcTotals: calcTotals,
    round2: round2,
    /* sales */
    listSales: listSales,
    getSale: getSale,
    createSale: createSale,
    updateSaleStatus: updateSaleStatus,
    deleteSale: deleteSale,
    clearSales: clearSales,
    /* reporting */
    stats: stats,
    salesToCsv: salesToCsv,
    /* cart */
    getCart: getCart,
    setCart: setCart,
    clearCart: clearCart,
    getCoupon: getCoupon,
    setCoupon: setCoupon,
    /* demo data */
    seedDemoSales: seedDemoSales
  };
})();