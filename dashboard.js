/* ==========================================================================
   dashboard.js  -  Shows every stored SALE (dashboard.html only).
   KPIs, a 7-day revenue chart, best sellers, the sales table, order details,
   CSV export and the demo-data buttons.
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.dashboard = (function () {
  'use strict';

  var $ = Spark.util.$, $$ = Spark.util.$$;
  var money = Spark.util.money;
  var e = Spark.util.escapeHtml;

  var filters = { query: '', status: '', sort: 'date-desc' };
  var openOrderId = null;

  var STATUS_BADGE = {
    completed: 'badge--ok',
    refunded: 'badge--warn',
    cancelled: 'badge--danger'
  };
  var PAY_STATUS_BADGE = { paid: 'badge--ok', pending: 'badge--info', refunded: 'badge--warn', void: 'badge--danger' };
  var METHOD_LABEL = { card: 'Card', upi: 'UPI', cod: 'Cash on delivery' };

  /* ---------------------------- 1. KPIs -------------------------------- */
  function renderKpis() {
    var s = Spark.db.stats();
    $('#kpiRevenue').textContent = money(s.revenue);
    $('#kpiOrders').textContent = s.orders;
    $('#kpiItems').textContent = s.itemsSold;
    $('#kpiAvg').textContent = money(s.avgOrder);

    $('#kpiRevenueFoot').textContent = s.refundedCount
      ? s.refundedCount + ' refunded, excluded'
      : 'Net of refunds';

    var foot = $('#kpiOrdersFoot');
    if (foot) {
      foot.textContent = s.bestDay && s.bestDay.value > 0
        ? 'Best day: ' + s.bestDay.label + ' (' + money(s.bestDay.value) + ')'
        : 'All time';
    }

    var items = $('#kpiItemsFoot');
    if (items) items.textContent = s.cancelledCount
      ? s.cancelledCount + ' cancelled order(s) ignored'
      : 'Units across all orders';

    $('#kpiPending').textContent = 'Pending (COD): ' + money(s.pending);

    var sub = $('#dbSubtitle');
    if (sub) {
      sub.textContent = Spark.db.listSales().length
        ? 'Every order placed on the store is recorded here \u2014 ' +
          Spark.db.listSales().length + ' stored in total.'
        : 'Every order placed on the store is recorded here.';
    }
  }

  /* --------------------------- 2. Chart -------------------------------- */
  function renderChart() {
    var host = $('#chart');
    if (!host) return;

    var days = Spark.db.stats().perDay;
    var max = days.reduce(function (m, d) { return Math.max(m, d.value); }, 0);

    host.innerHTML = days.map(function (d) {
      var height = max ? Math.max(3, Math.round((d.value / max) * 100)) : 3;
      return '<div class="chart__col" title="' + e(d.label) + ' \u2014 ' + money(d.value) + '">' +
          '<span class="chart__val">' + (d.value ? money(d.value) : '') + '</span>' +
          '<div class="chart__bar" style="height:' + height + '%"></div>' +
          '<span class="chart__label">' + e(d.label) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ------------------------ 3. Best sellers ---------------------------- */
  function renderTopProducts() {
    var host = $('#topProducts');
    if (!host) return;

    var s = Spark.db.stats();
    var top = s.topProducts;

    if (!top.length) {
      host.innerHTML = '<li><span class="muted small">No sales yet \u2014 nothing to rank.</span></li>';
    } else {
      var best = top[0].revenue || 1;
      host.innerHTML = top.map(function (p, i) {
        return '<li>' +
            '<span class="rank__no">' + (i + 1) + '</span>' +
            '<div>' +
              '<div>' + (p.emoji || '') + ' ' + e(p.name) + '</div>' +
              '<div class="rank__bar" style="width:' +
                Math.max(6, Math.round((p.revenue / best) * 100)) + '%"></div>' +
              '<div class="small muted">' + p.qty + ' sold</div>' +
            '</div>' +
            '<span class="mono">' + money(p.revenue) + '</span>' +
          '</li>';
      }).join('');
    }

    var hint = $('#methodHint');
    if (hint) {
      var methods = s.methods;
      var parts = Object.keys(methods).map(function (m) {
        return (METHOD_LABEL[m] || m) + ': ' + money(methods[m]);
      });
      hint.textContent = parts.length ? 'Revenue by payment method \u2014 ' + parts.join('  \u00b7  ')
        : 'Revenue by payment method appears here.';
    }
  }

  /* ------------------------ 4. Sales table ----------------------------- */
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    var out = (parts[0] || '?').charAt(0);
    if (parts.length > 1) out += parts[parts.length - 1].charAt(0);
    return out.toUpperCase();
  }

  /** Apply the search box, status filter and sort choice. */
  function filteredSales() {
    var list = Spark.db.listSales();
    var q = filters.query.trim().toLowerCase();

    if (filters.status) {
      list = list.filter(function (s) { return s.status === filters.status; });
    }

    if (q) {
      list = list.filter(function (s) {
        var haystack = [
          s.id, s.customer.name, s.customer.email, s.customer.city,
          s.payment.method, s.status,
          s.items.map(function (i) { return i.name; }).join(' ')
        ].join(' ').toLowerCase();
        return haystack.indexOf(q) !== -1;
      });
    }

    switch (filters.sort) {
      case 'date-asc':   list.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); }); break;
      case 'total-desc': list.sort(function (a, b) { return b.total - a.total; }); break;
      case 'total-asc':  list.sort(function (a, b) { return a.total - b.total; }); break;
      case 'customer':   list.sort(function (a, b) { return a.customer.name.localeCompare(b.customer.name); }); break;
      default:           list.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    }
    return list;
  }

  function renderTable() {
    var body = $('#salesBody');
    if (!body) return;

    var list = filteredSales();

    var countLine = $('#tableCount');
    if (countLine) {
      countLine.textContent = list.length + ' order' + (list.length === 1 ? '' : 's') +
        (filters.query || filters.status ? ' (filtered)' : '');
    }

    var emptyRow = $('#tableEmpty');
    if (emptyRow) emptyRow.classList.toggle('hidden', list.length > 0);

    body.innerHTML = list.map(function (s) {
      var names = s.items.map(function (i) { return i.name; });
      var firstFew = names.slice(0, 2).join(', ');
      var extra = names.length > 2 ? ' +' + (names.length - 2) + ' more' : '';

      return '<tr>' +
          '<td>' +
            '<div class="mono">' + e(s.id) + '</div>' +
            '<div class="small muted">' + e(Spark.util.formatDate(s.createdAt)) + '</div>' +
          '</td>' +
          '<td>' +
            '<div class="cust">' +
              '<span class="avatar">' + e(initials(s.customer.name)) + '</span>' +
              '<div>' +
                '<div>' + e(s.customer.name) + '</div>' +
                '<div class="small muted">' + e(s.customer.email || s.customer.city) + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div>' + s.itemCount + ' unit' + (s.itemCount === 1 ? '' : 's') + '</div>' +
            '<div class="small muted">' + e(firstFew) + e(extra) + '</div>' +
          '</td>' +
          '<td>' +
            '<div>' + e(METHOD_LABEL[s.payment.method] || s.payment.method) + '</div>' +
            '<div class="small muted">' +
              (s.payment.last4 ? 'ending ' + e(s.payment.last4) : e(s.payment.reference || '\u2014')) +
            '</div>' +
          '</td>' +
          '<td>' +
            '<span class="badge ' + (STATUS_BADGE[s.status] || '') + '">' + e(s.status) + '</span>' +
            '<div class="small muted">payment: ' + e(s.payment.status) + '</div>' +
          '</td>' +
          '<td class="text-right">' +
            '<div class="mono">' + money(s.total) + '</div>' +
            '<div class="small muted">' + e(s.channel) + '</div>' +
          '</td>' +
          '<td>' +
            '<div class="row-actions">' +
              '<button class="link-btn" type="button" data-act="view" data-id="' + e(s.id) + '">View</button>' +
              '<button class="link-btn link-btn--danger" type="button" data-act="delete" data-id="' +
                e(s.id) + '">Delete</button>' +
            '</div>' +
          '</td>' +
        '</tr>';
    }).join('');
  }

  function renderAll() {
    Spark.dashboard.renderKpis();
    Spark.dashboard.renderChart();
    Spark.dashboard.renderTopProducts();
    renderTable();
  }

  /* --------------------- 5. Order detail drawer ------------------------ */
  function openOrderDetail(id) {
    var sale = Spark.db.getSale(id);
    if (!sale) return;

    openOrderId = id;
    $('#odId').textContent = sale.id;

    $('#odItems').innerHTML = sale.items.map(function (it) {
      var product = Spark.catalog.find(it.productId);
      var img = product ? Spark.util.thumb(product.emoji, product.c1, product.c2) : '';
      return '<div class="line">' +
          '<img class="line__img" src="' + img + '" alt="' + e(it.name) + '">' +
          '<div>' +
            '<div class="line__name">' + e(it.name) + '</div>' +
            '<div class="line__meta">Qty ' + it.qty + ' &times; ' + money(it.price) + '</div>' +
          '</div>' +
          '<div class="line__right"><div class="line__total">' + money(it.lineTotal) + '</div></div>' +
        '</div>';
    }).join('');

    $('#odSubtotal').textContent = money(sale.subtotal);
    $('#odDiscount').textContent = '-' + money(sale.discount);
    $('#odShipping').textContent = sale.shipping ? money(sale.shipping) : 'FREE';
    $('#odTax').textContent = money(sale.tax);
    $('#odTotal').textContent = money(sale.total);

    var customer = [
      ['Name', sale.customer.name],
      ['Email', sale.customer.email],
      ['Phone', sale.customer.phone],
      ['Address', sale.customer.address],
      ['City', sale.customer.city + ' ' + sale.customer.zip]
    ];
    $('#odCustomer').innerHTML = customer.map(function (row) {
      return '<dt>' + e(row[0]) + '</dt><dd>' + e(row[1] || '\u2014') + '</dd>';
    }).join('');

    var payment = [
      ['Method', METHOD_LABEL[sale.payment.method] || sale.payment.method],
      ['Status', sale.payment.status],
      ['Reference', sale.payment.reference || (sale.payment.last4 ? 'ending ' + sale.payment.last4 : '\u2014')],
      ['Placed', Spark.util.formatDate(sale.createdAt)],
      ['Channel', sale.channel],
      ['Order status', sale.status]
    ];
    if (sale.note) payment.push(['Note', sale.note]);

    $('#odPayment').innerHTML = payment.map(function (row) {
      return '<dt>' + e(row[0]) + '</dt><dd>' + e(row[1]) + '</dd>';
    }).join('');

    var drawer = $('#orderDrawer');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeOrderDetail() {
    openOrderId = null;
    var drawer = $('#orderDrawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ------------------------- 6. CSV download --------------------------- */
  function downloadCsv() {
    var sales = Spark.db.listSales();
    if (!sales.length) {
      Spark.util.toast('There are no sales to export yet.', 'err');
      return;
    }

    var csv = '\ufeff' + Spark.db.salesToCsv(sales);     // BOM helps Excel read UTF-8
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var stamp = new Date().toISOString().slice(0, 10);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'spark-sales-' + stamp + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    Spark.util.toast('Exported ' + sales.length + ' sales to CSV.', 'ok');
  }

  /* ------------------------- 7. Event wiring --------------------------- */
  function init() {
    Spark.dashboard.renderAll();

    // Search / filter / sort
    var search = $('#searchSales');
    if (search) {
      search.addEventListener('input', Spark.util.debounce(function () {
        Spark.dashboard.filters.query = search.value;
        Spark.dashboard.renderTable();
      }, 180));
    }

    var status = $('#statusFilter');
    if (status) {
      status.addEventListener('change', function () {
        Spark.dashboard.filters.status = status.value;
        Spark.dashboard.renderTable();
      });
    }

    var sort = $('#sortSales');
    if (sort) {
      sort.addEventListener('change', function () {
        Spark.dashboard.filters.sort = sort.value;
        Spark.dashboard.renderTable();
      });
    }

    // Table row actions (delegated)
    var body = $('#salesBody');
    if (body) {
      body.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-act]');
        if (!btn) return;

        var id = btn.getAttribute('data-id');
        if (btn.getAttribute('data-act') === 'view') {
          Spark.dashboard.openOrderDetail(id);
          return;
        }

        if (btn.getAttribute('data-act') === 'delete') {
          var sale = Spark.db.getSale(id);
          if (!sale) return;
          if (!window.confirm('Permanently delete ' + sale.id + ' (' + sale.customer.name + ')?')) return;
          Spark.db.deleteSale(id);
          Spark.dashboard.renderAll();
          Spark.util.toast(sale.id + ' deleted.', 'info');
        }
      });
    }

    // Order detail drawer
    $$('[data-close-order]').forEach(function (el) {
      el.addEventListener('click', Spark.dashboard.closeOrderDetail);
    });

    var drawer = $('#orderDrawer');
    if (drawer) {
      drawer.addEventListener('click', function (ev) {
        var statusBtn = ev.target.closest('button[data-status]');
        if (!statusBtn || !openOrderId) return;
        var next = statusBtn.getAttribute('data-status');
        var updated = Spark.db.updateSaleStatus(openOrderId, next);
        if (updated) {
          Spark.dashboard.renderAll();
          Spark.dashboard.openOrderDetail(updated.id);   // refresh the panel
          Spark.util.toast(updated.id + ' marked as ' + next + '.', 'ok');
        }
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') Spark.dashboard.closeOrderDetail();
    });

    // Toolbar buttons
    var seed = $('#seedBtn');
    if (seed) {
      seed.addEventListener('click', function () {
        var added = Spark.db.seedDemoSales();
        Spark.dashboard.renderAll();
        Spark.util.toast('Added ' + added + ' demo sales.', 'ok');
      });
    }

    var exportBtn = $('#exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', Spark.dashboard.downloadCsv);

    var clear = $('#clearBtn');
    if (clear) {
      clear.addEventListener('click', function () {
        if (!Spark.db.listSales().length) {
          Spark.util.toast('Nothing to clear.', 'info');
          return;
        }
        if (!window.confirm('Delete every stored sale? This cannot be undone.')) return;
        Spark.db.clearSales();
        Spark.dashboard.renderAll();
        Spark.util.toast('All sales cleared.', 'info');
      });
    }

    // Footer notes
    var note = $('#storageNote');
    if (note && !Spark.db.isPersistent()) {
      note.textContent = 'Warning: this browser blocks local storage, so sales last only for this page view.';
    }

    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  }

  return { init: init };
})();

document.addEventListener('DOMContentLoaded', function () {
  Spark.dashboard.init();
});