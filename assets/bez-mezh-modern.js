(function () {
  'use strict';

  var VERSION = '20260923a';
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
    for (var i = 0; i < tiers.length; i += 1) {
      if (hours >= Number(tiers[i][0]) && hours < Number(tiers[i][1])) return tiers[i];
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
      phone: '+380966973130',
      phone_display: '+380 96 697 31 30',
      telegram: 'https://t.me/pereviznyk001',
      whatsapp: 'https://wa.me/380966973130'
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

  function fillAllSelects(route) {
    route = route || preferredRoute();
    document.querySelectorAll('[data-field="from"], [data-booking="from"]').forEach(function (select) {
      fillSelect(select, origins(), route.from);
      syncDestinationSelect(select.closest('form') || document, route.to);
    });
  }

  function setRouteInScope(scope, route) {
    if (!scope || !route) return;
    var from = scope.querySelector('[data-field="from"], [data-booking="from"]');
    var to = scope.querySelector('[data-field="to"], [data-booking="to"]');
    if (from) fillSelect(from, origins(), route.from);
    syncDestinationSelect(scope, route.to);
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
    var route = selectedFromScope(form, false);
    var cls = form.querySelector('[data-field="class"]') && form.querySelector('[data-field="class"]').value || state.currentClass;
    var q = quote(route.from, route.to, cls);
    state.selectedRoute = route;
    if (!q) {
      host.innerHTML = '<span>Ціну уточнить менеджер</span><strong>—</strong><small>' + esc(route.from) + ' → ' + esc(route.to) + '</small>';
      return;
    }
    host.innerHTML = '<span>' + esc(q.classLabel) + ' за 1 пасажира</span><strong>' + money(q.amount) + '</strong><small>' + esc(q.from) + ' → ' + esc(q.to) + ' · приблизно ' + formatHours(q.hours) + '</small>';
  }

  function filteredRoutes() {
    var query = lower(state.query);
    if (!query) return state.routes.slice();
    return state.routes.filter(function (route) {
      return lower(route.from + ' ' + route.to).indexOf(query) !== -1;
    });
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
      '<div class="bm-route-price"><span>ціна від</span><strong>' + esc(price) + '</strong></div>' +
      '<div class="bm-route-actions"><button type="button" class="bm-btn bm-btn--gold" data-card-book>Забронювати</button><button type="button" class="bm-btn bm-btn--outline" data-card-calc>Розрахувати</button></div>' +
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

  function defaultDate() {
    var d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function setBookingClass(cls) {
    state.currentClass = cls === 'lux' ? 'lux' : 'comfort';
    document.querySelectorAll('[data-class], [data-booking-class]').forEach(function (button) {
      var attr = button.hasAttribute('data-class') ? 'data-class' : 'data-booking-class';
      button.classList.toggle('is-active', button.getAttribute(attr) === state.currentClass);
    });
    document.querySelectorAll('[data-field="class"]').forEach(function (select) { select.value = state.currentClass; });
    document.querySelectorAll('[data-booking="time"]').forEach(function (select) { select.value = state.currentClass === 'lux' ? '18:00' : '08:00'; });
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
    host.innerHTML = '<span>Разом за ' + total.seats + ' пасажира</span><strong>' + money(total.total) + '</strong><small>' + esc(q.classLabel) + ' · ' + money(total.base) + ' за 1 дорослого · знижка ' + money(total.discount) + ' · приблизно ' + formatHours(q.hours) + '</small>';
  }

  function openBooking(route) {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    state.selectedRoute = route || state.selectedRoute || preferredRoute();
    setRouteInScope(modal, state.selectedRoute);
    var date = modal.querySelector('[data-booking="date"]');
    if (date && !date.value) date.value = defaultDate();
    renderBookingPrice();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(function () {
      var name = modal.querySelector('[data-booking="name"]');
      if (name) name.focus({ preventScroll: true });
    }, 80);
  }

  function closeBooking() {
    var modal = document.querySelector('[data-modal]');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function formatPhone(value) {
    var d = digits(value);
    if (d.indexOf('380') === 0) d = d.slice(3);
    else if (d.indexOf('80') === 0) d = d.slice(2);
    else if (d.indexOf('0') === 0) d = d.slice(1);
    d = d.slice(0, 9);
    var parts = [];
    if (d.slice(0, 2)) parts.push(d.slice(0, 2));
    if (d.slice(2, 5)) parts.push(d.slice(2, 5));
    if (d.slice(5, 7)) parts.push(d.slice(5, 7));
    if (d.slice(7, 9)) parts.push(d.slice(7, 9));
    return '+380' + (parts.length ? ' ' + parts.join(' ') : '');
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
      mode: 'frontend_only',
      name: normalize((form.querySelector('[data-booking="name"]') || {}).value),
      phone: normalize((form.querySelector('[data-booking="phone"]') || {}).value),
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
    if (!lead.phone || digits(lead.phone).length < 12) errors.push('Вкажіть номер телефону у форматі +380 XX XXX XX XX.');
    if (!lead.route || lead.route.indexOf('→') === -1) errors.push('Оберіть напрямок.');
    if (!lead.date) errors.push('Оберіть дату.');
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

  function bookingMessage(lead) {
    return [
      'Бронювання БЕЗ МЕЖ',
      'ПІБ: ' + lead.name,
      'Телефон: ' + lead.phone,
      'Маршрут: ' + lead.route,
      'Дата: ' + lead.date,
      'Час: ' + lead.time,
      'Клас: ' + lead.class,
      'Пасажири: ' + lead.passengers_total + ' (дорослі ' + lead.adults + ', діти ' + lead.children_under_16 + ', пенсіонери ' + lead.pensioners + ')',
      'Орієнтовна сума: ' + (lead.total_price || 'уточнити')
    ].join('\n');
  }

  function messengerUrl(lead) {
    var c = contacts();
    var base = c.whatsapp || 'https://wa.me/380971030454';
    try {
      var url = new URL(base, location.href);
      url.searchParams.set('text', bookingMessage(lead));
      return url.toString();
    } catch (error) {
      return 'https://wa.me/380971030454?text=' + encodeURIComponent(bookingMessage(lead));
    }
  }

  function openManagerSheet(channel) {
    var sheet = document.querySelector('[data-manager-sheet]');
    if (!sheet) return;
    var preferred = channel || 'whatsapp';
    sheet.setAttribute('data-preferred', preferred);
    sheet.querySelectorAll('[data-channel]').forEach(function (link) {
      link.classList.toggle('is-preferred', link.getAttribute('data-channel') === preferred);
    });
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('manager-sheet-open');
  }

  function closeManagerSheet() {
    var sheet = document.querySelector('[data-manager-sheet]');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('manager-sheet-open');
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

      var cardAction = event.target.closest('[data-card-book], [data-card-calc]');
      if (cardAction) {
        event.preventDefault();
        var card = cardAction.closest('[data-route-card]');
        var route = { from: card.getAttribute('data-from'), to: card.getAttribute('data-to') };
        state.selectedRoute = route;
        var quick = document.querySelector('[data-quick-form]');
        if (quick) setRouteInScope(quick, route);
        renderQuickPrice();
        if (cardAction.hasAttribute('data-card-book')) openBooking(route);
        else document.querySelector('.bm-hero__panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        event.target.value = formatPhone(event.target.value);
      }
    }, true);

    document.addEventListener('change', function (event) {
      var quickScope = event.target.closest('[data-quick-form]');
      var bookingScope = event.target.closest('[data-booking-form]');
      if (event.target.matches('[data-field="from"], [data-booking="from"]')) {
        syncDestinationSelect(quickScope || bookingScope || document);
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
        var route = selectedFromScope(quick, false);
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
        try { window.open(messengerUrl(lead), '_blank', 'noopener'); } catch (error) {}
        closeBooking();
        showToast('Дякуємо. Деталі бронювання підготовлено для менеджера.');
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeBooking();
        closeManagerSheet();
      }
    }, true);

    document.querySelectorAll('[data-load-more]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.visible += 18;
        renderRoutes();
      });
    });
  }

  function updateContactLinks() {
    var c = contacts();
    document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
      if ((link.textContent || '').indexOf('+380 96') !== -1) link.href = 'tel:' + (c.phone || '+380966973130');
    });
    document.querySelectorAll('a[href*="t.me"]').forEach(function (link) {
      if (c.telegram && link.href.indexOf('pereviznyk001') !== -1) link.href = c.telegram;
    });
    document.querySelectorAll('a[href*="wa.me"]').forEach(function (link) {
      if (c.whatsapp && link.href.indexOf('380966973130') !== -1) link.href = c.whatsapp;
    });
  }

  function initRevealAnimations() {
    var selectors = [
      '.bm-benefits article', '.bm-story__grid', '.bm-road-strip__card',
      '.bm-section-head', '.bm-route-card', '.bm-booking-cta__card',
      '.bm-fleet-grid figure', '.bm-faq details', '.bm-contact-main', '.bm-managers article'
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
    document.querySelectorAll('[data-booking="date"]').forEach(function (input) { input.value = defaultDate(); });
    setBookingClass('comfort');
    renderFaq();
    renderQuickPrice();
    updateContactLinks();
    initRevealAnimations();
    bindEvents();
    window.__bezMezh = {
      version: VERSION,
      routes: function () { return state.routes.slice(); },
      quote: quote,
      openBooking: openBooking,
      openManagerSheet: openManagerSheet,
      state: state
    };
  }

  fetch(dataUrl(), { cache: 'no-store' })
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
