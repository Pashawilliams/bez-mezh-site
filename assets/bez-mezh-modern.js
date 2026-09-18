(function () {
  'use strict';

  var VERSION = '20260918a';
  var MAX_PASSENGERS = 7;
  var CHILD_DISCOUNT = 0.15;
  var PENSIONER_DISCOUNT = 0.10;
  var state = {
    data: null,
    cls: 'comfort',
    adults: 1,
    children: 0,
    pensioners: 0,
    visible: 18,
    filter: 'all',
    query: '',
    selectedRoute: null
  };

  function scriptBase() {
    var current = document.currentScript || document.querySelector('script[src*="bez-mezh-modern.js"]');
    try { return new URL('../', current ? current.src : location.href); } catch (e) { return new URL('./', location.href); }
  }

  function dataUrl() {
    return new URL('data/site.json?v=' + VERSION, scriptBase()).toString();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }

  function digits(value) {
    return String(value || '').replace(/\D+/g, '');
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function fmt(n) {
    var x = Math.round(Number(n) || 0);
    return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function money(n) {
    return fmt(n) + ' грн';
  }

  function roundUah(n) {
    return Math.round((Number(n) || 0) / 50) * 50;
  }

  function routeKey(from, to) {
    return normalize(from) + '|' + normalize(to);
  }

  function durationFor(from, to) {
    var d = state.data && state.data.durations;
    if (!d) return null;
    return d[routeKey(from, to)] || d[routeKey(to, from)] || null;
  }

  function tierFor(hours) {
    var tiers = state.data && state.data.pricing && state.data.pricing.tiers;
    if (!tiers || !tiers.length || hours == null) return null;
    if (hours < tiers[0][0]) return tiers[0];
    for (var i = 0; i < tiers.length; i++) {
      if (hours >= tiers[i][0] && hours < tiers[i][1]) return tiers[i];
    }
    return tiers[tiers.length - 1];
  }

  function quote(from, to, cls) {
    cls = cls === 'lux' ? 'lux' : 'comfort';
    var dur = durationFor(from, to);
    if (!dur || dur.hours == null) return null;
    var tier = tierFor(Number(dur.hours));
    if (!tier) return null;
    var eur = cls === 'lux' ? tier[3] : tier[2];
    var rate = Number(state.data.pricing && state.data.pricing.eur_rate) || 51.449;
    var amount = roundUah(eur * rate);
    return {
      from: normalize(from),
      to: normalize(to),
      cls: cls,
      className: cls === 'lux' ? 'Lux' : 'Comfort',
      hours: Number(dur.hours),
      km: dur.km,
      src: dur.src || 'estimate',
      eur: eur,
      amount: amount,
      tier: tier[1] >= 999 ? tier[0] + '+ год' : tier[0] + '–' + tier[1] + ' год'
    };
  }

  function fmtHours(h) {
    h = Number(h) || 0;
    var hours = Math.floor(h);
    var min = Math.round((h - hours) * 60);
    if (min === 60) { hours += 1; min = 0; }
    return min ? hours + ' год ' + min + ' хв' : hours + ' год';
  }

  function passengerTotal(q) {
    if (!q) return null;
    var base = roundUah(q.amount);
    var child = roundUah(base * (1 - CHILD_DISCOUNT));
    var pensioner = roundUah(base * (1 - PENSIONER_DISCOUNT));
    var totalSeats = state.adults + state.children + state.pensioners;
    var full = totalSeats * base;
    var total = state.adults * base + state.children * child + state.pensioners * pensioner;
    return {
      base: base,
      child: child,
      pensioner: pensioner,
      seats: totalSeats,
      full: full,
      total: total,
      discount: Math.max(0, full - total)
    };
  }

  function contacts() {
    return (state.data && state.data.contacts) || {
      phone: '+380966973130',
      phone_display: '+380 96 697 31 30',
      telegram: 'https://t.me/pereviznyk001',
      whatsapp: 'https://wa.me/380966973130',
      support_note: 'Цілодобова підтримка'
    };
  }

  function isBackendUrl(url) {
    return /(?:admin-ajax\.php|\/wp-json\/|\/ru\/wp-json\/)/.test(String(url || ''));
  }

  function emptyBackendResponse() {
    var payload = JSON.stringify({ success: true, data: {}, static_mode: true });
    if (typeof Response === 'function') {
      return Promise.resolve(new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(payload)); }, text: function () { return Promise.resolve(payload); } });
  }

  function installStaticGuards() {
    if (!window.__bezMezhStaticGuards && typeof window.fetch === 'function') {
      var originalFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url);
        if (isBackendUrl(url)) return emptyBackendResponse();
        return originalFetch(input, init);
      };
      window.__bezMezhStaticGuards = true;
    }
    var $ = window.jQuery;
    if ($ && $.ajax && !$.ajax.__bezMezhStaticGuard) {
      var originalAjax = $.ajax;
      var guardedAjax = function (options) {
        var url = typeof options === 'string' ? options : options && options.url;
        if (isBackendUrl(url)) {
          var data = { success: true, data: {}, static_mode: true };
          var deferred = $.Deferred ? $.Deferred() : null;
          setTimeout(function () {
            if (options && typeof options.success === 'function') options.success(data, 'success', null);
            if (deferred) deferred.resolve(data, 'success', null);
          }, 0);
          return deferred ? deferred.promise() : { done: function (cb) { if (cb) setTimeout(function () { cb(data); }, 0); return this; }, fail: function () { return this; }, always: function (cb) { if (cb) setTimeout(cb, 0); return this; } };
        }
        return originalAjax.apply(this, arguments);
      };
      guardedAjax.__bezMezhStaticGuard = true;
      $.ajax = guardedAjax;
    }
  }

  function isHomePage() {
    return !!(document.getElementById('search-reys-btn') || document.getElementById('reyses-popular') || document.body.classList.contains('home'));
  }

  function allRoutes() {
    return (state.data && state.data.routes || []).filter(function (route) {
      return route && route.from && route.to;
    });
  }

  function citiesFromRoutes() {
    var seen = {};
    allRoutes().forEach(function (r) { seen[r.from] = 1; seen[r.to] = 1; });
    var uaOrder = ['Київ', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Запоріжжя', 'Полтава', 'Кременчук', 'Житомир'];
    return Object.keys(seen).sort(function (a, b) {
      var ia = uaOrder.indexOf(a), ib = uaOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b, 'uk');
    });
  }

  function makeOptions(selected) {
    return citiesFromRoutes().map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === selected ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
  }

  function firstRoute() {
    return allRoutes()[0] || { from: 'Київ', to: 'Берлін', source: 'eurotour' };
  }

  function selectedRouteFromForm(root) {
    var from = root.querySelector('[data-bm-field="from"]');
    var to = root.querySelector('[data-bm-field="to"]');
    var fallback = state.selectedRoute || firstRoute();
    return {
      from: from && from.value ? from.value : fallback.from,
      to: to && to.value ? to.value : fallback.to,
      source: fallback.source || 'all'
    };
  }

  function passengerRows() {
    return '' +
      passengerRow('adults', 'Дорослі', 'повний тариф', 1) +
      passengerRow('children', 'Діти до 16 років', 'знижка 15%', 0) +
      passengerRow('pensioners', 'Пенсіонери', 'знижка 10%', 0);
  }

  function passengerRow(key, title, note, min) {
    var val = state[key];
    return '<div class="bm-passenger-row" data-bm-passenger-row="' + key + '">' +
      '<div><strong>' + title + '</strong><span>' + note + '</span></div>' +
      '<div class="bm-counter" role="group" aria-label="' + title + '">' +
      '<button type="button" data-bm-step="-1" data-bm-passenger="' + key + '">−</button>' +
      '<input type="number" min="' + min + '" max="' + MAX_PASSENGERS + '" value="' + val + '" data-bm-count="' + key + '" inputmode="numeric" aria-label="' + title + '">' +
      '<button type="button" data-bm-step="1" data-bm-passenger="' + key + '">+</button>' +
      '</div></div>';
  }

  function normalizePassengers(changed) {
    state.adults = Math.max(1, Math.min(MAX_PASSENGERS, parseInt(state.adults, 10) || 1));
    state.children = Math.max(0, Math.min(MAX_PASSENGERS, parseInt(state.children, 10) || 0));
    state.pensioners = Math.max(0, Math.min(MAX_PASSENGERS, parseInt(state.pensioners, 10) || 0));
    var total = state.adults + state.children + state.pensioners;
    var over = total - MAX_PASSENGERS;
    if (over > 0) {
      var order = [];
      if (changed) order.push(changed);
      ['children', 'pensioners', 'adults'].forEach(function (x) { if (order.indexOf(x) === -1) order.push(x); });
      order.forEach(function (key) {
        if (over <= 0) return;
        var min = key === 'adults' ? 1 : 0;
        var can = Math.max(0, state[key] - min);
        var take = Math.min(can, over);
        state[key] -= take;
        over -= take;
      });
    }
  }

  function updatePassengerInputs(root) {
    normalizePassengers();
    root.querySelectorAll('[data-bm-count]').forEach(function (input) {
      input.value = String(state[input.getAttribute('data-bm-count')] || 0);
    });
    var total = state.adults + state.children + state.pensioners;
    root.querySelectorAll('[data-bm-step]').forEach(function (btn) {
      var key = btn.getAttribute('data-bm-passenger');
      var step = parseInt(btn.getAttribute('data-bm-step'), 10) || 0;
      var min = key === 'adults' ? 1 : 0;
      btn.disabled = step < 0 ? state[key] <= min : total >= MAX_PASSENGERS;
    });
  }

  function priceHtml(q, total) {
    if (!q || !total) {
      return '<div class="bm-price-box"><div class="bm-price-box__sum"><span>Оберіть напрямок</span><strong>—</strong></div><p class="bm-price-note">Після вибору маршруту система покаже тариф і суму зі знижками.</p></div>';
    }
    return '<div class="bm-price-box">' +
      '<div class="bm-price-box__top"><div><div class="bm-price-box__route">' + esc(q.from) + ' → ' + esc(q.to) + '</div><strong>' + q.className + ' · €' + q.eur + '</strong></div><span class="bm-badge bm-badge--warm">' + esc(q.tier) + '</span></div>' +
      '<div class="bm-price-breakdown"><div><span>Повний</span><b>' + money(total.base) + '</b></div><div><span>Дитячий</span><b>' + money(total.child) + '</b></div><div><span>Пенсійний</span><b>' + money(total.pensioner) + '</b></div></div>' +
      '<div class="bm-price-box__sum"><span>Разом за ' + total.seats + ' пас.</span><strong>' + money(total.total) + '</strong></div>' +
      '<p class="bm-price-note">У дорозі приблизно ' + fmtHours(q.hours) + (q.km ? ' · ' + fmt(q.km) + ' км' : '') + '. Загальна знижка: ' + money(total.discount) + '. Ціна розрахована за тарифом Eurotour.</p>' +
      '</div>';
  }

  function bookingPanelHtml(route) {
    route = route || firstRoute();
    state.selectedRoute = route;
    var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return '<div class="bm-booking-panel" data-bm-booking-panel>' +
      '<div class="bm-booking-panel__main">' +
      '<div class="bm-form-grid">' +
      '<label class="bm-field"><span class="bm-label">Звідки</span><select class="bm-select" data-bm-field="from">' + makeOptions(route.from) + '</select></label>' +
      '<label class="bm-field"><span class="bm-label">Куди</span><select class="bm-select" data-bm-field="to">' + makeOptions(route.to) + '</select></label>' +
      '<label class="bm-field"><span class="bm-label">Дата</span><input class="bm-input" type="date" data-bm-field="date" value="' + tomorrow + '"></label>' +
      '<label class="bm-field"><span class="bm-label">Час</span><select class="bm-select" data-bm-field="time"><option value="08:00"' + (state.cls !== 'lux' ? ' selected' : '') + '>08:00</option><option value="18:00"' + (state.cls === 'lux' ? ' selected' : '') + '>18:00</option><option value="Узгодити з менеджером">Узгодити з менеджером</option></select></label>' +
      '<div class="bm-field bm-field--wide"><span class="bm-label">Клас</span><div class="bm-class-switch"><button type="button" class="bm-class-btn" data-bm-class="comfort">Comfort<small>стандартний тариф</small></button><button type="button" class="bm-class-btn" data-bm-class="lux">Lux<small>підвищений комфорт</small></button></div></div>' +
      '</div>' +
      '<div class="bm-passengers">' + passengerRows() + '</div>' +
      '</div>' +
      '<div class="bm-booking-panel__aside" data-bm-price-host></div>' +
      '</div>';
  }

  function renderPrice(root) {
    var panel = root.querySelector('[data-bm-booking-panel]') || root;
    var route = selectedRouteFromForm(panel);
    state.selectedRoute = route;
    var q = quote(route.from, route.to, state.cls);
    var total = passengerTotal(q);
    var host = panel.querySelector('[data-bm-price-host]');
    if (host) {
      host.innerHTML = priceHtml(q, total) + '<div class="bm-actions" style="margin-top:12px"><button type="button" class="bm-btn bm-btn--warm" data-bm-open-booking>Забронювати поїздку</button><a class="bm-btn bm-btn--ghost" href="' + esc(contacts().telegram || '#') + '" target="_blank" rel="noopener">Написати менеджеру</a></div>';
    }
    updatePassengerInputs(panel);
    syncClassButtons(root);
  }

  function syncClassButtons(root) {
    root.querySelectorAll('[data-bm-class]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-bm-class') === state.cls);
    });
  }

  function filteredRoutes() {
    var routes = allRoutes();
    if (state.filter !== 'all') {
      routes = routes.filter(function (r) { return (r.source || '').indexOf(state.filter) !== -1; });
    }
    var q = normalize(state.query).toLowerCase();
    if (q) {
      routes = routes.filter(function (r) { return (r.from + ' ' + r.to).toLowerCase().indexOf(q) !== -1; });
    }
    return routes;
  }

  function routeCard(route) {
    var q = quote(route.from, route.to, state.cls);
    var label = route.source === 'eurotour' ? 'Eurotour' : route.source === 'bez-mezh' ? 'БЕЗ МЕЖ' : 'Маршрут';
    return '<article class="bm-card" data-bm-route-card data-from="' + esc(route.from) + '" data-to="' + esc(route.to) + '">' +
      '<div class="bm-card__route"><strong>' + esc(route.from) + ' → ' + esc(route.to) + '</strong><span>Адресна посадка та висадка за погодженням з менеджером</span></div>' +
      '<div class="bm-card__meta"><span class="bm-badge">' + esc(label) + '</span>' + (q ? '<span class="bm-badge bm-badge--green">~' + fmtHours(q.hours) + '</span><span class="bm-badge bm-badge--warm">' + q.className + '</span>' : '') + '</div>' +
      '<div class="bm-card__price"><span>ціна від</span><strong>' + (q ? money(q.amount) : '—') + '</strong></div>' +
      '<div class="bm-card__actions"><button type="button" class="bm-btn bm-btn--warm" data-bm-card-book>Забронювати</button><button type="button" class="bm-btn bm-btn--ghost" data-bm-card-select>Розрахувати</button></div>' +
      '</article>';
  }

  function renderRoutesList() {
    var grid = document.querySelector('[data-bm-routes-grid]');
    var count = document.querySelector('[data-bm-routes-count]');
    var more = document.querySelector('[data-bm-load-more]');
    if (!grid) return;
    var routes = filteredRoutes();
    if (count) count.textContent = 'Знайдено напрямків: ' + routes.length;
    var shown = routes.slice(0, state.visible);
    grid.innerHTML = shown.length ? shown.map(routeCard).join('') : '<div class="bm-empty">За цим запитом напрямків не знайдено. Спробуйте інше місто або напишіть менеджеру.</div>';
    if (more) more.hidden = routes.length <= shown.length;
  }

  function routesSectionHtml() {
    var total = allRoutes().length;
    return '<section id="bm-routes" class="bm-section bm-section--routes">' +
      '<div class="bm-shell">' +
      '<div class="bm-section__head"><div><span class="bm-eyebrow">Тарифи Eurotour</span><h2>Усі напрямки БЕЗ МЕЖ</h2></div><p>Обʼєднано маршрути Eurotour і напрямки з bez-mezh.com.ua. Система одразу рахує Comfort, Lux, дитячу та пенсійну знижку. У каталозі зараз ' + total + ' напрямків.</p></div>' +
      bookingPanelHtml(firstRoute()) +
      '<div class="bm-toolbar"><input class="bm-input" type="search" data-bm-route-search placeholder="Пошук напрямку: Київ, Берлін, Барселона..."><div class="bm-chip-row"><button type="button" class="bm-chip is-active" data-bm-filter="all">Усі</button><button type="button" class="bm-chip" data-bm-filter="eurotour">Eurotour</button><button type="button" class="bm-chip" data-bm-filter="bez-mezh">БЕЗ МЕЖ</button></div><div class="bm-routes-count" data-bm-routes-count></div></div>' +
      '<div class="bm-routes-grid" data-bm-routes-grid></div><div class="bm-load-more-wrap"><button type="button" class="bm-btn bm-btn--ghost" data-bm-load-more>Показати ще напрямки</button></div>' +
      '</div></section>';
  }

  function contactsSectionHtml() {
    var c = contacts();
    var managers = state.data.managers || [];
    var managerHtml = managers.map(function (m) {
      return '<div class="bm-manager"><div><strong>' + esc(m.name || 'Менеджер') + '</strong><span>' + esc(m.role || 'Менеджер з перевезень') + ' · ' + esc(m.phone || '') + '</span></div><div class="bm-manager__actions"><a href="' + esc(m.telegram || c.telegram || '#') + '" target="_blank" rel="noopener">Telegram</a><a href="' + esc(m.whatsapp || c.whatsapp || '#') + '" target="_blank" rel="noopener">WhatsApp</a></div></div>';
    }).join('');
    return '<section id="bm-contacts" class="bm-section bm-section--contacts"><div class="bm-shell">' +
      '<div class="bm-section__head"><div><span class="bm-eyebrow">Контакти</span><h2>Менеджер на звʼязку 24/7</h2></div><p>Контактні дані перенесені з Eurotour. Оберіть зручний спосіб звʼязку або залиште бронювання у фронтенд-формі.</p></div>' +
      '<div class="bm-contact-grid"><div class="bm-contact-card bm-contact-card--dark"><h3>' + esc(c.phone_display || c.phone) + '</h3><p>' + esc(c.support_note || 'Цілодобова підтримка') + '</p><div class="bm-contact-list"><a class="bm-contact-link" href="tel:' + esc(c.phone || '') + '"><span>Телефон</span><b>Подзвонити</b></a><a class="bm-contact-link" href="' + esc(c.telegram || '#') + '" target="_blank" rel="noopener"><span>Telegram</span><b>Написати</b></a><a class="bm-contact-link" href="' + esc(c.whatsapp || '#') + '" target="_blank" rel="noopener"><span>WhatsApp</span><b>Написати</b></a></div></div>' +
      '<div class="bm-contact-card"><h3>Команда бронювання</h3><p>Менеджери підтверджують маршрут, дату, клас поїздки, багаж і адресну посадку.</p><div class="bm-manager-grid">' + managerHtml + '</div></div></div>' +
      '</div></section>';
  }

  function faqSectionHtml() {
    var faq = state.data.faq || [];
    return '<section id="bm-faq" class="bm-section bm-section--faq"><div class="bm-shell">' +
      '<div class="bm-section__head"><div><span class="bm-eyebrow">FAQ</span><h2>Часті питання</h2></div><p>Оновлений блок відповідей: документи, багаж, тварини, знижки, класи Comfort і Lux.</p></div>' +
      '<div class="bm-faq">' + faq.map(function (item, index) {
        return '<details' + (index === 0 ? ' open' : '') + '><summary>' + esc(item.q) + '</summary><div class="bm-faq__answer">' + esc(item.a) + '</div></details>';
      }).join('') + '</div></div></section>';
  }

  function modalHtml() {
    return '<div class="bm-modal" data-bm-modal aria-hidden="true"><div class="bm-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="bm-booking-title">' +
      '<div class="bm-modal__head"><div><h3 id="bm-booking-title">Бронювання поїздки</h3><p>Форма рахує тариф і знижки. Реальна відправка вимкнена за вашим вибором.</p></div><button type="button" class="bm-modal__close" data-bm-close aria-label="Закрити">×</button></div>' +
      '<form class="bm-booking-form" data-bm-modal-form novalidate>' +
      '<div class="bm-form-errors" data-bm-errors></div>' +
      '<div data-bm-modal-panel>' + bookingPanelHtml(firstRoute()) + '</div>' +
      '<div class="bm-form-grid" style="margin-top:14px">' +
      '<label class="bm-field"><span class="bm-label">ПІБ</span><input class="bm-input" type="text" name="name" data-bm-user="name" placeholder="Ваше імʼя та прізвище" autocomplete="name" required></label>' +
      '<label class="bm-field"><span class="bm-label">Телефон</span><input class="bm-input" type="tel" name="phone" data-bm-user="phone" placeholder="+380..." autocomplete="tel" required></label>' +
      '<label class="bm-field bm-field--wide"><span class="bm-label">Коментар</span><textarea class="bm-textarea" name="comment" data-bm-user="comment" placeholder="Адреса посадки, багаж, побажання щодо місця"></textarea></label>' +
      '</div><p class="bm-front-note">Фронтенд-режим: заявка не відправляється на сервер і не потрапляє в Telegram. Після підключення каналу цей самий інтерфейс буде готовий до реальної відправки.</p>' +
      '<div class="bm-actions" style="margin-top:16px"><button type="submit" class="bm-btn bm-btn--warm">Підтвердити бронювання</button><button type="button" class="bm-btn bm-btn--ghost" data-bm-close>Скасувати</button></div>' +
      '</form></div></div>';
  }

  function mountSections() {
    if (!isHomePage() || document.getElementById('bm-routes')) return;
    var target = document.getElementById('reyses-popular');
    var parentSection = target;
    while (parentSection && parentSection.parentElement && parentSection.getAttribute('data-id') !== 'cb83d77') parentSection = parentSection.parentElement;
    var html = routesSectionHtml() + contactsSectionHtml() + faqSectionHtml();
    if (parentSection && parentSection.parentNode) parentSection.insertAdjacentHTML('beforebegin', html);
    else (document.querySelector('main') || document.body).insertAdjacentHTML('beforeend', html);
    renderRoutesList();
    renderPrice(document);
  }

  function mountModal() {
    if (!document.querySelector('[data-bm-modal]')) document.body.insertAdjacentHTML('beforeend', modalHtml());
    renderPrice(document.querySelector('[data-bm-modal]'));
  }

  function mountStickyContacts() {
    if (document.querySelector('.bm-sticky-contacts')) return;
    var c = contacts();
    document.body.insertAdjacentHTML('beforeend', '<div class="bm-sticky-contacts"><a href="' + esc(c.telegram || '#') + '" target="_blank" rel="noopener" title="Telegram"><img src="assets/icons/telegram.png" alt="Telegram"></a><a href="' + esc(c.whatsapp || '#') + '" target="_blank" rel="noopener" title="WhatsApp"><img src="assets/icons/whatsapp.png" alt="WhatsApp"></a><a href="tel:' + esc(c.phone || '') + '" title="Телефон"><img src="assets/icons/phone.png" alt="Телефон"></a></div>');
  }

  function updateContactsInDom() {
    var c = contacts();
    document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
      a.href = 'tel:' + (c.phone || '').replace(/\s+/g, '');
      if (/\+?\d[\d\s().-]{7,}/.test(a.textContent || '')) a.textContent = c.phone_display || c.phone;
    });
    document.querySelectorAll('a[href*="t.me"], a[href*="telegram"]').forEach(function (a) {
      if (c.telegram) a.href = c.telegram;
    });
    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function (a) {
      if (c.whatsapp) a.href = c.whatsapp;
    });
  }

  function setRouteInPanel(panel, route) {
    state.selectedRoute = route;
    var from = panel.querySelector('[data-bm-field="from"]');
    var to = panel.querySelector('[data-bm-field="to"]');
    if (from) from.value = route.from;
    if (to) to.value = route.to;
    renderPrice(panel);
  }

  function openModal(route) {
    mountModal();
    var modal = document.querySelector('[data-bm-modal]');
    if (!modal) return;
    if (route) {
      modal.querySelectorAll('[data-bm-booking-panel]').forEach(function (panel) { setRouteInPanel(panel, route); });
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bm-modal-open');
    setTimeout(function () {
      var name = modal.querySelector('[data-bm-user="name"]');
      if (name) name.focus();
    }, 60);
  }

  function closeModal() {
    var modal = document.querySelector('[data-bm-modal]');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bm-modal-open');
  }

  function showToast(message) {
    var toast = document.querySelector('[data-bm-toast]');
    if (!toast) {
      document.body.insertAdjacentHTML('beforeend', '<div class="bm-toast" data-bm-toast></div>');
      toast = document.querySelector('[data-bm-toast]');
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.classList.remove('is-visible'); }, 4300);
  }

  function collectLead(form) {
    var panel = form.querySelector('[data-bm-booking-panel]') || document;
    var r = selectedRouteFromForm(panel);
    var q = quote(r.from, r.to, state.cls);
    var total = passengerTotal(q);
    return {
      created_at: new Date().toISOString(),
      mode: 'frontend_only',
      name: normalize((form.querySelector('[data-bm-user="name"]') || {}).value),
      phone: normalize((form.querySelector('[data-bm-user="phone"]') || {}).value),
      comment: normalize((form.querySelector('[data-bm-user="comment"]') || {}).value),
      route: r.from + ' → ' + r.to,
      class: q ? q.className : (state.cls === 'lux' ? 'Lux' : 'Comfort'),
      date: normalize((panel.querySelector('[data-bm-field="date"]') || {}).value),
      time: normalize((panel.querySelector('[data-bm-field="time"]') || {}).value),
      adults: state.adults,
      children_under_16: state.children,
      pensioners: state.pensioners,
      passengers_total: state.adults + state.children + state.pensioners,
      ticket_price: q ? money(q.amount) : '',
      total_price: total ? money(total.total) : '',
      discount: total ? money(total.discount) : '',
      hours: q ? fmtHours(q.hours) : ''
    };
  }

  function saveFrontendLead(lead) {
    try {
      var list = JSON.parse(localStorage.getItem('bm_frontend_leads') || '[]');
      list.push(lead);
      localStorage.setItem('bm_frontend_leads', JSON.stringify(list.slice(-20)));
    } catch (e) {}
    try { console.info('БЕЗ МЕЖ frontend booking lead', lead); } catch (err) {}
  }

  function validateLead(lead) {
    var errors = [];
    if (!lead.name || lead.name.length < 2) errors.push('Вкажіть ПІБ пасажира.');
    if (!lead.phone || digits(lead.phone).length < 10) errors.push('Вкажіть коректний номер телефону.');
    if (!lead.date) errors.push('Оберіть дату поїздки.');
    if (!lead.time) errors.push('Оберіть час поїздки.');
    if (!lead.route || lead.route.indexOf('→') === -1) errors.push('Оберіть напрямок поїздки.');
    return errors;
  }

  function updateModalSummary() {
    var modal = document.querySelector('[data-bm-modal]');
    if (!modal || !modal.classList.contains('is-open')) return;
    renderPrice(modal);
  }

  function handleClick(e) {
    var classBtn = e.target.closest('[data-bm-class]');
    if (classBtn) {
      e.preventDefault();
      state.cls = classBtn.getAttribute('data-bm-class') === 'lux' ? 'lux' : 'comfort';
      document.querySelectorAll('[data-bm-field="time"]').forEach(function (select) { select.value = state.cls === 'lux' ? '18:00' : '08:00'; });
      document.querySelectorAll('[data-bm-booking-panel]').forEach(function (panel) { renderPrice(panel); });
      renderRoutesList();
      return;
    }
    var step = e.target.closest('[data-bm-step]');
    if (step) {
      e.preventDefault();
      var key = step.getAttribute('data-bm-passenger');
      var delta = parseInt(step.getAttribute('data-bm-step'), 10) || 0;
      state[key] = (parseInt(state[key], 10) || (key === 'adults' ? 1 : 0)) + delta;
      normalizePassengers(key);
      document.querySelectorAll('[data-bm-booking-panel]').forEach(function (panel) { renderPrice(panel); });
      return;
    }
    var filter = e.target.closest('[data-bm-filter]');
    if (filter) {
      e.preventDefault();
      state.filter = filter.getAttribute('data-bm-filter') || 'all';
      state.visible = 18;
      document.querySelectorAll('[data-bm-filter]').forEach(function (b) { b.classList.toggle('is-active', b === filter); });
      renderRoutesList();
      return;
    }
    if (e.target.closest('[data-bm-load-more]')) {
      e.preventDefault();
      state.visible += 18;
      renderRoutesList();
      return;
    }
    var cardBook = e.target.closest('[data-bm-card-book], [data-bm-card-select]');
    if (cardBook) {
      e.preventDefault();
      var card = cardBook.closest('[data-bm-route-card]');
      var route = { from: card.getAttribute('data-from'), to: card.getAttribute('data-to') };
      document.querySelectorAll('#bm-routes [data-bm-booking-panel]').forEach(function (panel) { setRouteInPanel(panel, route); });
      document.getElementById('bm-routes').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (cardBook.hasAttribute('data-bm-card-book')) openModal(route);
      return;
    }
    if (e.target.closest('[data-bm-open-booking]')) {
      e.preventDefault();
      openModal(state.selectedRoute || firstRoute());
      return;
    }
    if (e.target.closest('[data-bm-close]')) {
      e.preventDefault();
      closeModal();
      return;
    }
    var modal = e.target.closest('[data-bm-modal]');
    if (modal && e.target === modal) closeModal();
  }

  function handleInput(e) {
    var count = e.target.closest('[data-bm-count]');
    if (count) {
      var key = count.getAttribute('data-bm-count');
      state[key] = parseInt(count.value, 10) || (key === 'adults' ? 1 : 0);
      normalizePassengers(key);
      document.querySelectorAll('[data-bm-booking-panel]').forEach(function (panel) { renderPrice(panel); });
      return;
    }
    if (e.target.matches('[data-bm-route-search]')) {
      state.query = e.target.value || '';
      state.visible = 18;
      renderRoutesList();
    }
  }

  function handleChange(e) {
    if (e.target.matches('[data-bm-field="from"], [data-bm-field="to"], [data-bm-field="date"], [data-bm-field="time"]')) {
      var panel = e.target.closest('[data-bm-booking-panel]');
      if (panel) renderPrice(panel);
    }
  }

  function handleSubmit(e) {
    var form = e.target;
    if (!form) return;
    if (form.matches('[data-bm-modal-form]')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      var lead = collectLead(form);
      var errors = validateLead(lead);
      var box = form.querySelector('[data-bm-errors]');
      if (errors.length) {
        if (box) { box.innerHTML = errors.map(esc).join('<br>'); box.classList.add('is-visible'); }
        return false;
      }
      if (box) { box.textContent = ''; box.classList.remove('is-visible'); }
      saveFrontendLead(lead);
      showToast('Бронювання перевірено у фронтенд-режимі. Сума: ' + lead.total_price + '. Для реальної заявки підключіть канал відправки.');
      closeModal();
      form.reset();
      state.adults = 1; state.children = 0; state.pensioners = 0;
      document.querySelectorAll('[data-bm-booking-panel]').forEach(function (panel) { renderPrice(panel); });
      return false;
    }
    if (form.classList && (form.classList.contains('elementor-form') || form.classList.contains('online-bron'))) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      showToast('Форма працює у фронтенд-режимі: дані перевірені, реальна відправка вимкнена. Скористайтесь новим блоком бронювання для точного розрахунку.');
      return false;
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    }, true);
  }

  function initWithData(data) {
    state.data = data || {};
    installStaticGuards();
    document.body.classList.add('bm-modern-ready');
    mountSections();
    mountModal();
    mountStickyContacts();
    updateContactsInDom();
    bindEvents();
    window.__bezMezhModern = {
      version: VERSION,
      quote: quote,
      routes: allRoutes,
      state: state,
      renderRoutesList: renderRoutesList,
      openBooking: openModal
    };
  }

  function boot() {
    installStaticGuards();
    fetch(dataUrl(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('site.json ' + response.status);
        return response.json();
      })
      .then(initWithData)
      .catch(function (err) {
        console.warn('БЕЗ МЕЖ modern layer: data load failed', err);
        initWithData({ routes: [], durations: {}, pricing: { eur_rate: 51.449, tiers: [[6, 999, 250, 290]] } });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
