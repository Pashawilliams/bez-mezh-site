(function () {
  'use strict';

  var VERSION = '20260925h';
  var MAX_PASSENGERS = 7;
  var CHILD_DISCOUNT = 0.15;
  var PENSIONER_DISCOUNT = 0.10;
  var state = {
    data: {},
    routes: [],
    currentClass: 'comfort',
    visible: 18,
    query: '',
    selectedRoute: null,
    adults: 1,
    children: 0,
    pensioners: 0
  };

  function currentScriptBase() {
    var script = document.currentScript || document.querySelector('script[src*="bez-mezh-modern.js"]');
    try { return new URL('../', script ? script.src : location.href); }
    catch (error) { return new URL('./', location.href); }
  }

  var BASE_URL = currentScriptBase();

  function dataUrl() {
    return new URL('data/site.json?v=' + VERSION, BASE_URL).toString();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function lower(value) {
    return normalize(value).toLowerCase();
  }

  function digits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function formatNumber(value) {
    return String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function money(value) {
    return formatNumber(value) + ' грн';
  }

  function plural(n, one, few, many) {
    n = Math.abs(Math.round(Number(n))) || 0;
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function roundUah(value) {
    return Math.round((Number(value) || 0) / 50) * 50;
  }

  function formatHours(value) {
    var raw = Number(value) || 0;
    var hours = Math.floor(raw);
    var minutes = Math.round((raw - hours) * 60);
    if (minutes === 60) { hours += 1; minutes = 0; }
    return minutes ? hours + ' год ' + minutes + ' хв' : hours + ' год';
  }

  function routeKey(from, to) {
    return normalize(from) + '|' + normalize(to);
  }

  function durationFor(from, to) {
    var durations = state.data.durations || {};
    return durations[routeKey(from, to)] || durations[routeKey(to, from)] || null;
  }

  function tierFor(hours) {
    var tiers = state.data.pricing && state.data.pricing.tiers || [];
    if (!tiers.length) return null;
    var h = Number(hours);
    if (h < Number(tiers[0][0])) return tiers[0];
    for (var i = 0; i < tiers.length; i += 1) {
      if (h >= Number(tiers[i][0]) && h < Number(tiers[i][1])) return tiers[i];
    }
    return tiers[tiers.length - 1];
  }

  function quote(from, to, className) {
    className = className === 'lux' ? 'lux' : 'comfort';
    var duration = durationFor(from, to);
    if (!duration || duration.hours == null) return null;
    var hours = Number(duration.hours);
    var tier = tierFor(hours);
    if (!tier) return null;
    var eur = className === 'lux' ? Number(tier[3]) : Number(tier[2]);
    var rate = Number(state.data.pricing && state.data.pricing.eur_rate) || 51.449;
    var amount = roundUah(eur * rate);
    return {
      from: normalize(from),
      to: normalize(to),
      className: className,
      classLabel: className === 'lux' ? 'Lux' : 'Comfort',
      hours: hours,
      km: duration.km,
      eur: eur,
      amount: amount
    };
  }

  function passengerTotal(q) {
    if (!q) return null;
    normalizePassengers();
    var base = roundUah(q.amount);
    var child = roundUah(base * (1 - CHILD_DISCOUNT));
    var pensioner = roundUah(base * (1 - PENSIONER_DISCOUNT));
    var seats = state.adults + state.children + state.pensioners;
    var full = seats * base;
    var total = state.adults * base + state.children * child + state.pensioners * pensioner;
    return {
      seats: seats,
      base: base,
      child: child,
      pensioner: pensioner,
      total: total,
      discount: Math.max(0, full - total)
    };
  }

  function contacts() {
    return state.data.contacts || {
      phone: '+380971030454',
      phone_display: '+380 97 103 04 54',
      telegram: 'https://t.me/+380971030454',
      whatsapp: 'https://wa.me/380971030454'
    };
  }

  function preferredRoute() {
    return state.routes.find(function (r) { return r.from === 'Київ' && r.to === 'Прага'; }) ||
      state.routes.find(function (r) { return r.from === 'Київ' && r.to === 'Берлін'; }) ||
      state.routes.find(function (r) { return r.from === 'Київ'; }) ||
      state.routes[0] || { from: 'Київ', to: 'Прага' };
  }

  function origins() {
    var map = {};
    state.routes.forEach(function (route) { if (route.from) map[route.from] = true; });
    return sortCities(Object.keys(map));
  }

  function destinationsFor(from) {
    var map = {};
    state.routes.forEach(function (route) {
      if (!from || route.from === from) map[route.to] = true;
    });
    return sortCities(Object.keys(map));
  }

  function sortCities(list) {
    var top = ['Київ', 'Львів', 'Житомир', 'Кременчук', 'Полтава', 'Дніпро', 'Запоріжжя', 'Прага', 'Берлін', 'Варшава'];
    return list.sort(function (a, b) {
      var ai = top.indexOf(a);
      var bi = top.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b, 'uk');
    });
  }

  function fillSelect(select, list, selected) {
    if (!select) return;
    var current = selected || select.value || list[0] || '';
    if (list.indexOf(current) === -1) current = list[0] || '';
    select.innerHTML = list.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === current ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
  }

  function syncDestinationSelect(scope, selectedTo) {
    var from = scope.querySelector('[data-field="from"], [data-booking="from"]');
    var to = scope.querySelector('[data-field="to"], [data-booking="to"]');
    if (!from || !to) return;
    fillSelect(to, destinationsFor(from.value), selectedTo);
  }

  function fillSelectPlaceholder(select, list, selected) {
    if (!select) return;
    var current = selected && list.indexOf(selected) !== -1 ? selected : '';
    select.innerHTML = '<option value="">Оберіть місто</option>' + list.map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === current ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    select.value = current;
  }

  function fillAllSelects(route) {
    route = route || preferredRoute();
    document.querySelectorAll('[data-field="from"]').forEach(function (select) {
      fillSelectPlaceholder(select, origins(), '');
      var scope = select.closest('form') || document;
      var to = scope.querySelector('[data-field="to"]');
      fillSelectPlaceholder(to, destinationsFor(''), '');
    });
    document.querySelectorAll('[data-booking="from"]').forEach(function (select) {
      fillSelect(select, origins(), route.from);
      syncDestinationSelect(select.closest('form') || document, route.to);
    });
  }

  function setRouteInScope(scope, route) {
    if (!scope || !route) return;
    var isQuick = !!scope.querySelector('[data-field="from"]');
    var from = scope.querySelector('[data-field="from"], [data-booking="from"]');
    var to = scope.querySelector('[data-field="to"], [data-booking="to"]');
    if (from) {
      if (isQuick) fillSelectPlaceholder(from, origins(), route.from);
      else fillSelect(from, origins(), route.from);
    }
    if (isQuick) {
      if (to) fillSelectPlaceholder(to, destinationsFor(route.from), route.to);
    } else {
      syncDestinationSelect(scope, route.to);
    }
    if (to) to.value = route.to;
  }

  function selectedFromScope(scope, booking) {
    var from = scope.querySelector(booking ? '[data-booking="from"]' : '[data-field="from"]');
    var to = scope.querySelector(booking ? '[data-booking="to"]' : '[data-field="to"]');
    return {
      from: from && from.value || preferredRoute().from,
      to: to && to.value || preferredRoute().to
    };
  }

  function renderQuickPrice() {
    var form = document.querySelector('[data-quick-form]');
    var host = document.querySelector('[data-quick-price]');
    if (!form || !host) return;
    var fromEl = form.querySelector('[data-field="from"]');
    var toEl = form.querySelector('[data-field="to"]');
    var pickedFrom = fromEl && fromEl.value || '';
    var pickedTo = toEl && toEl.value || '';
    if (!pickedFrom || !pickedTo) {
      host.innerHTML = '<span>Ціна після вибору напрямку</span><strong>—</strong><small>Оберіть міста «Звідки» та «Куди»</small>';
      return;
    }
    var route = { from: pickedFrom, to: pickedTo };
    var cls = form.querySelector('[data-field="class"]') && form.querySelector('[data-field="class"]').value || state.currentClass;
    var q = quote(route.from, route.to, cls);
    state.selectedRoute = route;
    if (!q) {
      host.innerHTML = '<span>Ціну уточнить менеджер</span><strong>—</strong><small>' + esc(route.from) + ' → ' + esc(route.to) + '</small>';
      return;
    }
    host.innerHTML = '<span>' + esc(q.classLabel) + ' за 1 пасажира</span><strong>' + money(q.amount) + '</strong><small>' + esc(q.from) + ' → ' + esc(q.to) + ' · приблизно ' + formatHours(q.hours) + '</small>';
  }

  var SEARCH_ALIASES = {
    'киев': 'київ', 'львов': 'львів', 'одесса': 'одеса', 'харьков': 'харків',
    'днепр': 'дніпро', 'днепропетровск': 'дніпро', 'запорожье': 'запоріжжя',
    'ровно': 'рівне', 'кишинев': 'кишинів', 'берлин': 'берлін',
    'краков': 'краків', 'кременчуг': 'кременчук', 'винница': 'вінниця',
    'чернигов': 'чернігів', 'суммы': 'суми'
  };

  function searchTokens(value) {
    return lower(value).replace(/[\u2013\u2014\u2015\u2022,.;:!?()«»""''/\\|-]+/g, ' ').split(/\s+/)
      .map(function (t) { return SEARCH_ALIASES[t] || t; })
      .filter(function (t) { return t.length > 1; });
  }

  function routeMatches(route, tokens) {
    if (!tokens.length) return true;
    var hay = lower(route.from + ' ' + route.to);
    return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function filteredRoutes() {
    var tokens = searchTokens(state.query);
    if (!tokens.length) return state.routes.slice();
    return state.routes.filter(function (route) { return routeMatches(route, tokens); });
  }

  function routeCard(route, index) {
    var q = quote(route.from, route.to, state.currentClass);
    var price = q ? money(q.amount) : 'за запитом';
    var duration = q ? formatHours(q.hours) : 'уточнення';
    var km = q && q.km ? formatNumber(q.km) + ' км' : 'адресно';
    return '<article class="bm-route-card" style="animation-delay:' + Math.min(index * 18, 220) + 'ms" data-route-card data-from="' + esc(route.from) + '" data-to="' + esc(route.to) + '">' +
      '<h3>' + esc(route.from) + ' → ' + esc(route.to) + '</h3>' +
      '<p>Адресна посадка та висадка за погодженням з менеджером.</p>' +
      '<div class="bm-route-meta"><span class="bm-tag">' + esc(state.currentClass === 'lux' ? 'Lux' : 'Comfort') + '</span><span class="bm-tag">' + esc(duration) + '</span><span class="bm-tag">' + esc(km) + '</span></div>' +
      '<div class="bm-route-price"><span>ціна</span><strong>' + esc(price) + '</strong></div>' +
      '<div class="bm-route-actions"><button type="button" class="bm-btn bm-btn--gold" data-card-book>Забронювати</button></div>' +
      '</article>';
  }

  function renderRoutes() {
    var grid = document.querySelector('[data-routes-grid]');
    var count = document.querySelector('[data-route-count]');
    var more = document.querySelector('[data-load-more]');
    if (!grid) return;
    var list = filteredRoutes();
    var shown = list.slice(0, state.visible);
    grid.innerHTML = shown.length ? shown.map(routeCard).join('') : '<div class="bm-empty">Напрямок не знайдено. Спробуйте інше місто або натисніть “Забронювати”, щоб менеджер уточнив варіант.</div>';
    if (count) count.textContent = 'Знайдено напрямків: ' + list.length;
    if (more) more.hidden = list.length <= shown.length;
    var total = document.querySelector('[data-routes-total]');
    if (total) total.textContent = String(state.routes.length);
  }

  function renderFaq() {
    var host = document.querySelector('[data-faq]');
    if (!host) return;
    var items = state.data.faq || [];
    host.innerHTML = items.slice(0, 10).map(function (item, index) {
      return '<details' + (index === 0 ? ' open' : '') + '><summary>' + esc(item.q || '') + '</summary><div class="bm-faq__answer">' + esc(item.a || '') + '</div></details>';
    }).join('');
  }

  function renderReviews() {
    var host = document.querySelector('[data-reviews]');
    if (!host) return;
    var items = state.data.reviews || [];
    if (!items.length) {
      var section = host.closest('section');
      if (section) section.hidden = true;
      return;
    }
    host.innerHTML = items.slice(0, 6).map(function (r) {
      var n = Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5));
      var star = String.fromCharCode(9733);
      var stars = '';
      for (var i = 0; i < n; i += 1) stars += star;
      return '<article class="bm-review"><div class="bm-review__stars" aria-label="Оцінка ' + n + ' з 5">' +
        esc(stars) + '</div><p>' + esc(r.text || '') + '</p>' +
        '<footer><b>' + esc(r.name || '') + '</b><span>' + esc(r.date || '') + '</span></footer></article>';
    }).join('');
  }

  function renderAdvantages() {
    var host = document.querySelector('[data-advantages]');
    if (!host) return;
    var items = state.data.advantages || [];
    host.innerHTML = items.slice(0, 12).map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('');
  }

  function renderAnnouncement() {
    var host = document.querySelector('[data-announce]');
    if (!host) return;
    var a = state.data.site && state.data.site.announcement;
    if (!a || !a.enabled || !a.text) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = '<a href="' + esc(a.link || '#routes') + '">' + esc(a.text) + ' &#8594;</a>';
  }

  function normalizePassengers(changed) {
    state.adults = Math.max(1, Math.min(MAX_PASSENGERS, parseInt(state.adults, 10) || 1));
    state.children = Math.max(0, Math.min(MAX_PASSENGERS, parseInt(state.children, 10) || 0));
    state.pensioners = Math.max(0, Math.min(MAX_PASSENGERS, parseInt(state.pensioners, 10) || 0));
    var total = state.adults + state.children + state.pensioners;
    var over = total - MAX_PASSENGERS;
    if (over > 0) {
      ['children', 'pensioners', 'adults'].forEach(function (key) {
        if (key === changed || over <= 0) return;
        var min = key === 'adults' ? 1 : 0;
        var canRemove = Math.max(0, state[key] - min);
        var remove = Math.min(canRemove, over);
        state[key] -= remove;
        over -= remove;
      });
      if (over > 0 && changed) state[changed] = Math.max(changed === 'adults' ? 1 : 0, state[changed] - over);
    }
  }

  function syncPassengerInputs() {
    normalizePassengers();
    document.querySelectorAll('[data-passenger-input]').forEach(function (input) {
      var key = input.getAttribute('data-passenger-input');
      input.value = String(state[key] || 0);
    });
    var total = state.adults + state.children + state.pensioners;
    document.querySelectorAll('[data-step]').forEach(function (button) {
      var key = button.getAttribute('data-passenger');
      var step = Number(button.getAttribute('data-step')) || 0;
      var min = key === 'adults' ? 1 : 0;
      button.disabled = step > 0 ? total >= MAX_PASSENGERS : state[key] <= min;
    });
  }

  function pad2(n) { return ('0' + n).slice(-2); }

  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function defaultDate() {
    var d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function setBookingClass(cls) {
    state.currentClass = cls === 'lux' ? 'lux' : 'comfort';
    document.querySelectorAll('[data-class], [data-booking-class]').forEach(function (button) {
      var attr = button.hasAttribute('data-class') ? 'data-class' : 'data-booking-class';
      button.classList.toggle('is-active', button.getAttribute(attr) === state.currentClass);
    });
    document.querySelectorAll('[data-field="class"]').forEach(function (select) { select.value = state.currentClass; });
    renderRoutes();
    renderQuickPrice();
    renderBookingPrice();
  }

  function renderBookingPrice() {
    var modal = document.querySelector('[data-modal]');
    var host = document.querySelector('[data-booking-price]');
    if (!modal || !host) return;
    var route = selectedFromScope(modal, true);
    var q = quote(route.from, route.to, state.currentClass);
    var total = passengerTotal(q);
    syncPassengerInputs();
    if (!q || !total) {
      host.innerHTML = '<span>Ціну уточнить менеджер</span><strong>—</strong><small>' + esc(route.from) + ' → ' + esc(route.to) + '</small>';
      return;
    }
    host.innerHTML = '<span>Разом: ' + total.seats + ' ' + plural(total.seats, 'пасажир', 'пасажири', 'пасажирів') + '</span><strong>' + money(total.total) + '</strong><small>' + esc(q.classLabel) + ' · ' + money(total.base) + ' за 1 дорослого · знижка ' + money(total.discount) + ' · приблизно ' + formatHours(q.hours) + '</small>';
  }

  var lastFocused = null;
  var savedScrollY = 0;

  function lockBodyScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = (-savedScrollY) + 'px';
    document.body.classList.add('modal-open');
  }

  function unlockBodyScroll() {
    if (!document.body.classList.contains('modal-open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  function focusables(container) {
    if (!container) return [];
    return Array.prototype.slice.call(container.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null; });
  }

  function trapTab(event, container) {
    if (event.key !== 'Tab' || !container) return;
    var items = focusables(container);
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function restoreFocus() {
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus({ preventScroll: true }); } catch (error) {}
    }
    lastFocused = null;
  }

  function setBookingSuccessVisible(show, lead) {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    var form = modal.querySelector('[data-booking-form]');
    var success = modal.querySelector('[data-booking-success]');
    if (!form || !success) return;
    form.hidden = !!show;
    success.hidden = !show;
    if (show) {
      var routeEl = success.querySelector('[data-success-route]');
      var totalEl = success.querySelector('[data-success-total]');
      if (routeEl) routeEl.textContent = lead && lead.route ? String(lead.route) : 'Маршрут обрано';
      var totalText = 'Сума розрахована';
      if (lead) {
        var bits = [];
        if (lead.date) {
          var dp = String(lead.date).split('-');
          bits.push(dp.length === 3 ? dp[2] + '.' + dp[1] + '.' + dp[0] : String(lead.date));
        }
        if (lead.class) bits.push(String(lead.class));
        if (lead.total_price) bits.push(String(lead.total_price));
        if (bits.length) totalText = bits.join(' · ');
      }
      if (totalEl) totalEl.textContent = totalText;
    }
  }

  function resetScrollTops(root) {
    if (!root) return;
    var nodes = [root].concat(Array.prototype.slice.call(
      root.querySelectorAll('.bm-modal__panel, [data-booking-form], [data-booking-success], .bm-manager-choice__panel')
    ));
    nodes.forEach(function (el) { try { el.scrollTop = 0; } catch (error) {} });
  }

  function showBookingSuccess(lead) {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    setBookingSuccessVisible(true, lead);
    resetScrollTops(modal);
    setTimeout(function () {
      var btn = modal.querySelector('[data-booking-success] [data-close-modal]');
      if (btn) btn.focus({ preventScroll: true });
    }, 80);
  }

  function openBooking(route) {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    var alreadyOpen = modal.classList.contains('is-open');
    if (!alreadyOpen) {
      lastFocused = document.activeElement;
      lockBodyScroll();
    }
    setBookingSuccessVisible(false);
    state.selectedRoute = route || state.selectedRoute || preferredRoute();
    setRouteInScope(modal, state.selectedRoute);
    var date = modal.querySelector('[data-booking="date"]');
    if (date) {
      date.min = todayLocal();
      if (!date.value) date.value = defaultDate();
    }
    renderBookingPrice();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    resetScrollTops(modal);
    setTimeout(function () {
      resetScrollTops(modal);
      var first = modal.querySelector('[data-booking="from"]');
      if (first) first.focus({ preventScroll: true });
    }, 80);
  }

  function closeBooking() {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    if (!modal.classList.contains('is-open')) return;
    resetScrollTops(modal);
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    restoreFocus();
  }

  function formatPhone(value) {
    var d = digits(value);
    if (!d) return '';
    if (d.indexOf('380') === 0) d = d.slice(3);
    else if (d.indexOf('80') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = d.slice(1);
    d = d.slice(0, 9);
    var parts = [];
    if (d.slice(0, 2)) parts.push(d.slice(0, 2));
    if (d.slice(2, 5)) parts.push(d.slice(2, 5));
    if (d.slice(5, 7)) parts.push(d.slice(5, 7));
    if (d.slice(7, 9)) parts.push(d.slice(7, 9));
    return '+380' + (parts.length ? ' ' + parts.join(' ') : '');
  }

  function displayPhone(phone) {
    var d = digits(phone);
    if (d.indexOf('380') === 0 && d.length === 12) {
      return '+380 ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10);
    }
    return '+' + d;
  }

  function showToast(text) {
    var toast = document.querySelector('[data-toast]');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('is-visible'); }, 3200);
  }

  function collectBooking(form) {
    var route = selectedFromScope(form, true);
    var q = quote(route.from, route.to, state.currentClass);
    var total = passengerTotal(q);
    return {
      created_at: new Date().toISOString(),
      mode: 'site_booking',
      name: normalize((form.querySelector('[data-booking="name"]') || {}).value),
      phone: normalize((form.querySelector('[data-booking="phone"]') || {}).value),
      from: route.from,
      to: route.to,
      route: route.from + ' → ' + route.to,
      date: normalize((form.querySelector('[data-booking="date"]') || {}).value),
      time: normalize((form.querySelector('[data-booking="time"]') || {}).value),
      class: state.currentClass === 'lux' ? 'Lux' : 'Comfort',
      adults: state.adults,
      children_under_16: state.children,
      pensioners: state.pensioners,
      passengers_total: state.adults + state.children + state.pensioners,
      total_price: total ? money(total.total) : '',
      ticket_price: q ? money(q.amount) : '',
      discount: total ? money(total.discount) : ''
    };
  }

  function validateBooking(lead) {
    var errors = [];
    if (!lead.name || lead.name.length < 2) errors.push('Вкажіть ПІБ пасажира.');
    var phoneDigits = digits(lead.phone);
    if (!/^380\d{9}$/.test(phoneDigits)) errors.push('Вкажіть номер телефону у форматі +380 XX XXX XX XX.');
    if (!lead.from || !lead.to) errors.push('Оберіть напрямок.');
    if (!lead.date) errors.push('Оберіть дату.');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(lead.date)) errors.push('Невірний формат дати.');
    else if (lead.date < todayLocal()) errors.push('Ця дата вже минула. Оберіть актуальну дату виїзду.');
    if (!lead.time) errors.push('Оберіть час.');
    return errors;
  }

  function saveLead(lead) {
    try {
      var list = JSON.parse(localStorage.getItem('bez_mezh_booking_leads') || '[]');
      list.push(lead);
      localStorage.setItem('bez_mezh_booking_leads', JSON.stringify(list.slice(-30)));
    } catch (error) {}
  }

  function sendLeadToBot(lead) {
    try {
      var inbox = state.data && state.data.bridge && state.data.bridge.inbox;
      if (!inbox || !lead || !window.fetch) return;
      var d = String(lead.date || '').split('-');
      var ev = {
        kind: 'lead', ts: new Date().toISOString(), page: location.href,
        lead: {
          type: 'booking',
          fields: {
            'Імʼя': lead.name || '',
            'Телефон': lead.phone || '',
            'Маршрут': lead.route || ((lead.from || '') + ' → ' + (lead.to || '')),
            'Дата рейсу': d.length === 3 ? d[2] + '.' + d[1] + '.' + d[0] : String(lead.date || ''),
            'Час відправлення': lead.time || '',
            'Пасажирів': String(lead.passengers_total == null ? '' : lead.passengers_total)
          },
          context: { 'Клас': lead.class || '', 'Ціна квитка': lead.ticket_price || '' }
        }
      };
      fetch('https://ntfy.sh/' + inbox, { method: 'POST', body: JSON.stringify(ev), keepalive: true }).catch(function () {});
    } catch (err) { /* offline-safe: заявка вже збережена локально */ }
  }




  var PENDING_KEY = 'bez_mezh_pending_lead';



  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch (error) {}
  }

  function openManagerSheet(channel, message) {
    var sheet = document.querySelector('[data-manager-sheet]');
    if (!sheet) return;
    if (!sheet.classList.contains('is-open')) lastFocused = document.activeElement;
    var preferred = channel === 'telegram' || channel === 'phone' ? channel : 'whatsapp';
    sheet.setAttribute('data-preferred', preferred);
    var title = sheet.querySelector('#manager-choice-title');
    if (title) {
      var writeT = title.getAttribute('data-title-write') || 'Кому написати?';
      var callT = title.getAttribute('data-title-call') || 'Кому зателефонувати?';
      title.textContent = preferred === 'phone' ? callT : writeT;
    }
    sheet.querySelectorAll('[data-channel]').forEach(function (link) {
      var base = link.getAttribute('data-base-href') || link.getAttribute('href') || '#';
      if (!link.getAttribute('data-base-href')) link.setAttribute('data-base-href', base);
      if (message && link.getAttribute('data-channel') === 'whatsapp') {
        link.setAttribute('href', base.split('?')[0] + '?text=' + encodeURIComponent(message));
      } else {
        link.setAttribute('href', base);
      }
      link.classList.toggle('is-preferred', link.getAttribute('data-channel') === preferred);
    });
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    resetScrollTops(sheet);
    var sheetClose = sheet.querySelector('[data-close-manager-sheet]');
    if (sheetClose) sheetClose.focus({ preventScroll: true });
  }

  function closeManagerSheet() {
    var sheet = document.querySelector('[data-manager-sheet]');
    if (!sheet) return;
    if (!sheet.classList.contains('is-open')) return;
    resetScrollTops(sheet);
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    restoreFocus();
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var menuBtn = event.target.closest('[data-menu-toggle]');
      if (menuBtn) {
        var nav = document.querySelector('[data-nav]');
        var open = nav && nav.classList.toggle('is-open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      var navLink = event.target.closest('[data-nav] a');
      if (navLink) {
        var navEl = document.querySelector('[data-nav]');
        var menuButton = document.querySelector('[data-menu-toggle]');
        if (navEl) navEl.classList.remove('is-open');
        if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
      }

      var sheetLink = event.target.closest('[data-manager-sheet] a[data-channel]');
      if (sheetLink) {
        clearPending();
        return;
      }

      var managerChoice = event.target.closest('[data-manager-choice]');
      if (managerChoice) {
        event.preventDefault();
        openManagerSheet(managerChoice.getAttribute('data-manager-choice'));
        return;
      }

      if (event.target.closest('[data-close-manager-sheet]')) {
        event.preventDefault();
        closeManagerSheet();
        return;
      }

      var openSheet = document.querySelector('[data-manager-sheet].is-open');
      if (openSheet && !event.target.closest('[data-manager-sheet]') && !event.target.closest('[data-manager-choice]')) {
        closeManagerSheet();
      }

      if (event.target.closest('[data-open-booking]')) {
        event.preventDefault();
        openBooking(state.selectedRoute || preferredRoute());
        return;
      }

      var cls = event.target.closest('[data-class]');
      if (cls) {
        event.preventDefault();
        setBookingClass(cls.getAttribute('data-class'));
        return;
      }

      var bookingCls = event.target.closest('[data-booking-class]');
      if (bookingCls) {
        event.preventDefault();
        setBookingClass(bookingCls.getAttribute('data-booking-class'));
        return;
      }

      var preset = event.target.closest('[data-route-preset]');
      if (preset) {
        event.preventDefault();
        state.query = preset.getAttribute('data-route-preset') || '';
        document.querySelectorAll('[data-route-search]').forEach(function (input) { input.value = state.query; });
        state.visible = 18;
        renderRoutes();
        document.querySelector('[data-route-search]').focus({ preventScroll: true });
        return;
      }

      var step = event.target.closest('[data-step]');
      if (step) {
        event.preventDefault();
        var key = step.getAttribute('data-passenger');
        var delta = Number(step.getAttribute('data-step')) || 0;
        state[key] = (Number(state[key]) || (key === 'adults' ? 1 : 0)) + delta;
        normalizePassengers(key);
        renderBookingPrice();
        return;
      }

      var cardAction = event.target.closest('[data-card-book]');
      if (cardAction) {
        event.preventDefault();
        var card = cardAction.closest('[data-route-card]');
        var route = { from: card.getAttribute('data-from'), to: card.getAttribute('data-to') };
        state.selectedRoute = route;
        var quick = document.querySelector('[data-quick-form]');
        if (quick) setRouteInScope(quick, route);
        renderQuickPrice();
        openBooking(route);
        return;
      }

      if (event.target.closest('[data-close-modal]')) {
        event.preventDefault();
        closeBooking();
        return;
      }

      var modal = event.target.closest('[data-modal]');
      if (modal && event.target === modal) closeBooking();
    }, true);

    document.addEventListener('input', function (event) {
      if (event.target.matches('[data-route-search]')) {
        state.query = event.target.value || '';
        state.visible = 18;
        renderRoutes();
        return;
      }

      if (event.target.matches('[data-passenger-input]')) {
        var key = event.target.getAttribute('data-passenger-input');
        state[key] = Number(event.target.value) || (key === 'adults' ? 1 : 0);
        normalizePassengers(key);
        renderBookingPrice();
        return;
      }

      if (event.target.matches('[data-booking="phone"]')) {
        var phoneEl = event.target;
        var rawBefore = phoneEl.value;
        var caretPos = null;
        try { caretPos = phoneEl.selectionStart; } catch (e) { caretPos = null; }
        var digitsBefore = caretPos == null ? -1 : digits(rawBefore.slice(0, caretPos)).length;
        var formatted = formatPhone(rawBefore);
        phoneEl.value = formatted;
        var caretTo = formatted.length;
        if (digitsBefore >= 0 && digits(rawBefore).length === digits(formatted).length) {
          var pos = 0, seen = 0;
          while (pos < formatted.length && seen < digitsBefore) {
            if (/\d/.test(formatted.charAt(pos))) seen += 1;
            pos += 1;
          }
          caretTo = pos;
        }
        try { phoneEl.setSelectionRange(caretTo, caretTo); } catch (e2) {}
      }
    }, true);

    document.addEventListener('change', function (event) {
      var quickScope = event.target.closest('[data-quick-form]');
      var bookingScope = event.target.closest('[data-booking-form]');
      if (event.target.matches('[data-field="from"]')) {
        var qScope = event.target.closest('[data-quick-form]') || document;
        var qFrom = qScope.querySelector('[data-field="from"]');
        fillSelectPlaceholder(qScope.querySelector('[data-field="to"]'), destinationsFor(qFrom && qFrom.value), '');
      } else if (event.target.matches('[data-booking="from"]')) {
        syncDestinationSelect(bookingScope || document);
      }
      if (quickScope && event.target.matches('[data-field]')) {
        if (event.target.matches('[data-field="class"]')) setBookingClass(event.target.value);
        else {
          renderQuickPrice();
          renderRoutes();
        }
      }
      if (bookingScope && event.target.matches('[data-booking]')) renderBookingPrice();
    }, true);

    document.addEventListener('submit', function (event) {
      var quick = event.target.closest('[data-quick-form]');
      if (quick) {
        event.preventDefault();
        var qFromEl = quick.querySelector('[data-field="from"]');
        var qToEl = quick.querySelector('[data-field="to"]');
        if (!qFromEl || !qFromEl.value) {
          showToast('Оберіть місто відправлення.');
          if (qFromEl) qFromEl.focus();
          return;
        }
        if (!qToEl || !qToEl.value) {
          showToast('Оберіть місто прибуття.');
          if (qToEl) qToEl.focus();
          return;
        }
        var route = { from: qFromEl.value, to: qToEl.value };
        state.selectedRoute = route;
        renderQuickPrice();
        openBooking(route);
        return;
      }

      var form = event.target.closest('[data-booking-form]');
      if (form) {
        event.preventDefault();
        var lead = collectBooking(form);
        var errors = validateBooking(lead);
        var box = form.querySelector('[data-form-error]');
        if (errors.length) {
          box.innerHTML = errors.map(esc).join('<br>');
          box.classList.add('is-visible');
          return;
        }
        box.textContent = '';
        box.classList.remove('is-visible');
        saveLead(lead);
        sendLeadToBot(lead);
        clearPending();
        showBookingSuccess(lead);
        showToast('Заявка відправлена.');
      }
    }, true);

    document.addEventListener('focusin', function (event) {
      var scope = event.target && event.target.closest ? event.target.closest('[data-modal].is-open, [data-manager-sheet].is-open') : null;
      if (!scope) return;
      if (!event.target.matches('input, select, textarea')) return;
      var field = event.target;
      setTimeout(function () {
        try {
          if (document.activeElement !== field) return;
          var stillOpen = field.closest ? field.closest('[data-modal].is-open, [data-manager-sheet].is-open') : null;
          if (!stillOpen) return;
          field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (err) {}
      }, 250);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeBooking();
        closeManagerSheet();
        return;
      }
      if (event.key === 'Tab') {
        var modal = document.querySelector('[data-modal].is-open .bm-modal__panel');
        if (modal) trapTab(event, modal);
        var sheet = document.querySelector('[data-manager-sheet].is-open .bm-manager-choice__panel');
        if (sheet) trapTab(event, sheet);
      }
    }, true);

    document.querySelectorAll('[data-load-more]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.visible += 18;
        renderRoutes();
      });
    });
  }

  function bookingManagers() {
    var c = contacts();
    var list = c.booking_managers || [];
    if (!list.length && c.phone) list = [{ name: '', phone: c.phone }];
    return list;
  }

  function updateContactLinks() {
    var list = bookingManagers();
    if (!list.length) return;
    document.querySelectorAll('[data-mgr]').forEach(function (el) {
      var idx = parseInt(el.getAttribute('data-mgr'), 10) || 0;
      var m = list[Math.min(idx, list.length - 1)];
      if (!m || !m.phone) return;
      var ch = el.getAttribute('data-ch') || 'tel';
      if (ch === 'wa') el.setAttribute('href', 'https://wa.me/' + digits(m.phone));
      else if (ch === 'tg') el.setAttribute('href', 'https://t.me/+' + digits(m.phone));
      else el.setAttribute('href', 'tel:+' + digits(m.phone));
      if (el.hasAttribute('data-mgr-label') && m.name) el.textContent = m.name + ': ' + displayPhone(m.phone);
      else if (el.hasAttribute('data-mgr-num')) el.textContent = displayPhone(m.phone);
      else if (el.hasAttribute('data-mgr-name') && m.name) el.textContent = m.name;
    });
  }

  function initRevealAnimations() {
    var selectors = [
      '.bm-benefits article', '.bm-story__grid', '.bm-road-strip__card',
      '.bm-section-head', '.bm-route-card', '.bm-booking-cta__card',
      '.bm-fleet-grid figure', '.bm-faq details', '.bm-contact-main', '.bm-managers article', '.bm-review'
    ];
    var items = Array.prototype.slice.call(document.querySelectorAll(selectors.join(',')));
    if (!items.length) return;
    items.forEach(function (el) { el.classList.add('bm-reveal'); });
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { observer.observe(el); });
  }

  function init(data) {
    state.data = data || {};
    state.routes = (state.data.routes || []).filter(function (route) { return route && route.from && route.to; });
    state.selectedRoute = preferredRoute();
    fillAllSelects(state.selectedRoute);
    document.querySelectorAll('[data-booking="date"]').forEach(function (input) {
      input.min = todayLocal();
      if (!input.value) input.value = defaultDate();
    });
    setBookingClass('comfort');
    renderFaq();
    renderReviews();
    renderAdvantages();
    renderAnnouncement();
    renderQuickPrice();
    updateContactLinks();
    initRevealAnimations();
    bindEvents();
    clearPending();
    window.__bezMezh = {
      version: VERSION,
      routes: function () { return state.routes.slice(); },
      quote: quote,
      openBooking: openBooking,
      openManagerSheet: openManagerSheet,
      state: state
    };
  }

  fetch(dataUrl())
    .then(function (response) {
      if (!response.ok) throw new Error('data load ' + response.status);
      return response.json();
    })
    .then(init)
    .catch(function (error) {
      console.error('Не вдалося завантажити дані сайту', error);
      init({ routes: [], durations: {}, pricing: { eur_rate: 51.449, tiers: [[6, 999, 250, 290]] }, faq: [] });
    });
})();
