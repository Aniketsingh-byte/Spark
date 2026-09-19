/* ==========================================================================
   checkout.js  -  Turns the cart into a stored SALE (checkout.html only).
   Flow:  read cart -> validate form -> Spark.db.createSale() -> show receipt
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.checkout = (function () {
  'use strict';

  var $ = Spark.util.$, $$ = Spark.util.$$;
  var money = Spark.util.money;
  var e = Spark.util.escapeHtml;

  var PAYMENT_LABELS = { card: 'Card', upi: 'UPI', cod: 'Cash on delivery' };

  /* ---------------------- 1. Validate single fields -------------------- */
  var RULES = {
    fullName: function (v) {
      return v.trim().length >= 2 ? '' : 'Please enter your full name.';
    },
    email: function (v) {
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()) ? '' : 'Enter a valid email, e.g. ada@example.com';
    },
    phone: function (v) {
      return v.replace(/\D/g, '').length >= 7 ? '' : 'Enter at least 7 digits.';
    },
    address: function (v) {
      return v.trim().length >= 5 ? '' : 'Please enter your street address.';
    },
    city: function (v) {
      return v.trim().length >= 2 ? '' : 'Please enter your city.';
    },
    zip: function (v) {
      return v.trim().length >= 3 ? '' : 'Please enter a postal code.';
    },
    cardNumber: function (v) {
      return v.replace(/\D/g, '').length >= 15 ? '' : 'Card number must have at least 15 digits.';
    },
    cardExpiry: function (v) {
      var m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(v.trim());
      if (!m) return 'Use the MM/YY format.';
      var month = Number(m[1]), year = 2000 + Number(m[2]);
      if (month < 1 || month > 12) return 'Month must be 01-12.';
      if (new Date(year, month, 1) < new Date()) return 'That card has already expired.';
      return '';
    },
    cardCvv: function (v) {
      return /^\d{3,4}$/.test(v.trim()) ? '' : 'CVV must be 3 or 4 digits.';
    },
    upiId: function (v) {
      return /^[\w.\-]{2,}@[a-z]{2,}$/i.test(v.trim()) ? '' : 'Enter a UPI ID like yourname@bank';
    },
    agree: function (v, el) {
      return el.checked ? '' : 'Please tick the box to continue.';
    }
  };

  function setError(fieldId, message) {
    var input = document.getElementById(fieldId);
    var slot = $('[data-err-for="' + fieldId + '"]');
    if (input) input.classList.toggle('is-invalid', !!message);
    if (slot) slot.textContent = message || '';
    return !message;
  }

  function validateField(fieldId) {
    var input = document.getElementById(fieldId);
    if (!input || !RULES[fieldId]) return true;
    return setError(fieldId, RULES[fieldId](input.value, input));
  }

  function currentMethod() {
    var checked = $('input[name="payment"]:checked');
    return checked ? checked.value : 'card';
  }

  /** Which fields matter depends on the chosen payment method. */
  function requiredFields() {
    var base = ['fullName', 'email', 'phone', 'address', 'city', 'zip', 'agree'];
    var method = currentMethod();
    if (method === 'card') return base.concat(['cardNumber', 'cardExpiry', 'cardCvv']);
    if (method === 'upi') return base.concat(['upiId']);
    return base;                                   // cash on delivery
  }

  /* ------------------- 2. Paint the order summary ---------------------- */
  function renderSummary() {
    var host = $('#summaryItems');
    var cart = Spark.cart.items();
    var t = Spark.cart.totals();

    if (host) {
      host.innerHTML = cart.map(function (line) {
        var product = Spark.catalog.find(line.productId);
        var img = product ? Spark.util.thumb(product.emoji, product.c1, product.c2) : '';
        return '<div class="line">' +
            '<img class="line__img" src="' + img + '" alt="' + e(line.name) + '">' +
            '<div>' +
              '<div class="line__name">' + e(line.name) + '</div>' +
              '<div class="line__meta">Qty ' + line.qty + ' &times; ' + money(line.price) + '</div>' +
            '</div>' +
            '<div class="line__right"><div class="line__total">' +
              money(line.price * line.qty) + '</div></div>' +
          '</div>';
      }).join('') || '<p class="muted small">No items in the cart.</p>';
    }

    $('#sumSubtotal').textContent = money(t.subtotal);
    $('#sumDiscount').textContent = '-' + money(t.discount);
    $('#sumShipping').textContent = t.shipping ? money(t.shipping) : 'FREE';
    $('#sumTax').textContent = money(t.tax);
    $('#sumTotal').textContent = money(t.total);
    $('#payTotal').textContent = money(t.total);

    var msg = $('#couponMsg');
    if (msg) {
      if (t.coupon) {
        msg.className = 'small';
        msg.innerHTML = '&#10003; <b>' + e(t.coupon.code) + '</b> applied &mdash; ' + e(t.coupon.label) +
          ' <button class="link-btn link-btn--danger" type="button" id="removeCouponBtn">remove</button>';
      } else {
        msg.className = 'small muted';
        msg.innerHTML = 'Try <b>SPARK10</b>, <b>LEARN20</b>, <b>WELCOME5</b> or <b>FREESHIP</b>.';
      }
    }
    return t;
  }

  /* ------------------ 3. Show / hide payment panels -------------------- */
  function syncPaymentPanels() {
    var method = currentMethod();
    $('#cardFields').classList.toggle('hidden', method !== 'card');
    $('#upiFields').classList.toggle('hidden', method !== 'upi');
    $('#codFields').classList.toggle('hidden', method !== 'cod');

    $$('#payOptions .pay').forEach(function (label) {
      label.classList.toggle('is-active', label.querySelector('input').checked);
    });
  }

  /* ---------------------- 4. Store the sale ---------------------------- */
  function buildDraft() {
    var method = currentMethod();
    var digits = ($('#cardNumber').value || '').replace(/\D/g, '');
    var draft = {
      customer: {
        name: $('#fullName').value.trim(),
        email: $('#email').value.trim(),
        phone: $('#phone').value.trim(),
        address: $('#address').value.trim(),
        city: $('#city').value.trim(),
        zip: $('#zip').value.trim()
      },
      payment: {
        method: method,
        last4: method === 'card' ? digits.slice(-4) : '',
        reference: method === 'card'
          ? 'AUTH-' + Math.random().toString(36).slice(2, 8).toUpperCase()
          : (method === 'upi' ? $('#upiId').value.trim() : 'COD')
      },
      items: Spark.cart.items(),
      discount: Spark.cart.totals().discount,
      note: $('#orderNote').value.trim(),
      channel: 'Online store'
    };
    return draft;
  }

  function showReceipt(sale) {
    $('#checkoutForm').classList.add('hidden');
    $('#emptyNotice').classList.add('hidden');
    $('#receiptPanel').classList.remove('hidden');

    var step = $('#stepDone');
    if (step) step.style.opacity = '1';

    $('#rcName').textContent = sale.customer.name.split(' ')[0] || 'friend';
    $('#rcId').textContent = sale.id;

    var rows = [
      ['Order ID', sale.id],
      ['Placed', Spark.util.formatDate(sale.createdAt)],
      ['Items', sale.itemCount + ' unit' + (sale.itemCount === 1 ? '' : 's')],
      ['Subtotal', money(sale.subtotal)],
      ['Discount', '-' + money(sale.discount)],
      ['Shipping', sale.shipping ? money(sale.shipping) : 'FREE'],
      ['Tax', money(sale.tax)],
      ['Total charged', money(sale.total)],
      ['Payment', PAYMENT_LABELS[sale.payment.method] +
        (sale.payment.last4 ? ' ending ' + sale.payment.last4 : '')],
      ['Payment status', sale.payment.status],
      ['Ships to', sale.customer.address + ', ' + sale.customer.city + ' ' + sale.customer.zip],
      ['Human check', 'Someone will email ' + sale.customer.email + ' when it ships']
    ];

    $('#rcDetails').innerHTML = rows.map(function (row) {
      return '<dt>' + e(row[0]) + '</dt><dd>' + e(row[1]) + '</dd>';
    }).join('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    Spark.util.toast('Order ' + sale.id + ' stored in the sales log.', 'ok');
  }
  /* ------------------------ 5. Place the order -------------------------- */
  function onSubmit(ev) {
    ev.preventDefault();

    if (!Spark.cart.items().length) {
      Spark.util.toast('Your cart is empty.', 'err');
      return;
    }

    // 1. Validate every field that matters for the chosen method
    var firstBad = null;
    requiredFields().forEach(function (id) {
      if (!validateField(id) && !firstBad) firstBad = id;
    });

    if (firstBad) {
      var input = document.getElementById(firstBad);
      if (input) {
        input.focus();
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      Spark.util.toast('Please fix the highlighted fields.', 'err');
      return;
    }

    // 2. Short fake gateway delay, so the UI feels like the real thing
    var btn = $('#placeOrderBtn');
    btn.disabled = true;
    btn.textContent = 'Processing payment\u2026';

    setTimeout(function () {
      try {
        var sale = Spark.db.createSale(buildDraft());   // <-- the sale is stored here
        Spark.cart.clear();
        Spark.cart.render();
        showReceipt(sale);
      } catch (err) {
        console.error('[spark] could not store sale', err);
        Spark.util.toast('Could not store the order: ' + err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = 'Place order &mdash; <span>$' + Spark.cart.totals().total.toFixed(2) + '</span>';
      }
    }, 550);
  }

  /* ------------------------ 6. Event wiring ---------------------------- */
  function init() {
    if (Spark.cart.items().length === 0) {
      $('#checkoutForm').classList.add('hidden');
      $('#emptyNotice').classList.remove('hidden');
    } else {
      renderSummary();
    }

    syncPaymentPanels();
    Spark.cart.init();

    // Payment method radios
    $$('input[name="payment"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        syncPaymentPanels();
        // Clear stale errors on fields that are no longer relevant.
        ['cardNumber', 'cardExpiry', 'cardCvv', 'upiId'].forEach(function (id) {
          if (requiredFields().indexOf(id) === -1) setError(id, '');
        });
      });
    });

    // Validate a field as soon as the user leaves it
    Object.keys(RULES).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener(id === 'agree' ? 'change' : 'blur', function () {
        validateField(id);
      });
    });

    // Format the card number as "4242 4242 4242 4242" while typing
    var cardNumber = $('#cardNumber');
    if (cardNumber) {
      cardNumber.addEventListener('input', function () {
        var digits = cardNumber.value.replace(/\D/g, '').slice(0, 19);
        cardNumber.value = digits.replace(/(.{4})/g, '$1 ').trim();
      });
    }

    // Auto-insert the slash in MM/YY
    var expiry = $('#cardExpiry');
    if (expiry) {
      expiry.addEventListener('input', function () {
        var digits = expiry.value.replace(/\D/g, '').slice(0, 4);
        expiry.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
      });
    }

    // Coupon: apply + remove
    var applyBtn = $('#applyCouponBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        var result = Spark.cart.applyCoupon($('#couponInput').value);
        Spark.util.toast(result.message, result.ok ? 'ok' : 'err');
        if (result.ok) { $('#couponInput').value = ''; renderSummary(); }
      });
    }

    document.addEventListener('click', function (ev) {
      if (!ev.target.closest('#removeCouponBtn')) return;
      Spark.cart.removeCoupon();
      renderSummary();
      Spark.util.toast('Coupon removed.', 'info');
    });

    // Place order + print receipt
    $('#checkoutForm').addEventListener('submit', onSubmit);
    var printBtn = $('#printReceiptBtn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  }

  return {
    RULES: RULES,
    PAYMENT_LABELS: PAYMENT_LABELS,
    setError: setError,
    validateField: validateField,
    requiredFields: requiredFields,
    currentMethod: currentMethod,
    renderSummary: renderSummary,
    syncPaymentPanels: syncPaymentPanels,
    init: init
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  Spark.checkout.init();
});
