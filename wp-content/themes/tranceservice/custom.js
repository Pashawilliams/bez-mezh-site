// One-page mode: old static WordPress-export pages redirect to the new homepage.
(function () {
    var marker = '/bez-mezh-site/';
    var path = window.location.pathname;
    var base = '/';
    var i = path.indexOf(marker);
    if (i !== -1) base = path.slice(0, i) + marker;
    var isHome = path === base || path === base + 'index.html';
    if (!isHome) window.location.replace(base + (window.location.hash || ''));
})();

document.addEventListener('DOMContentLoaded', function () {
    const wrapper = document.getElementById('search-reys-btn');
    const target = document.getElementById('reyses-popular');

    if (!wrapper || !target) return;

	const btn = wrapper.querySelector('.apply-filters__button');
	if (!btn) return;
    btn.addEventListener('click', function (e) {
        
        // проверяем, что кнопка активна
        if (!btn.disabled && !btn.classList.contains('jsf_disabled')) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});



  //Скрывать dropdown выбора городов в фильтре при клике на пустом месте
  jQuery(document).on('click', '.jet-radio-list__row.jet-filter-row', function () {
    jQuery('body').trigger('click');
  });
  //Конец Скрывать dropdown выбора городов в фильтре при клике на пустом месте

jQuery(function ($) {

    // Русский
    $.datepicker.regional['ru-RU'] = {
        closeText: 'Закрыть',
        prevText: '‹',
        nextText: '›',
        currentText: 'Сегодня',
        monthNames: ['Январь','Февраль','Март','Апрель','Май','Июнь',
                     'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],
        monthNamesShort: ['Янв','Фев','Мар','Апр','Май','Июн',
                          'Июл','Авг','Сен','Окт','Ноя','Дек'],
        dayNames: ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'],
        dayNamesShort: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
        dayNamesMin: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],
        weekHeader: 'Нед',
        dateFormat: 'dd.mm.yy',
        firstDay: 1,
        isRTL: false,
        showMonthAfterYear: false,
        yearSuffix: ''
    };

    // Украинский
    $.datepicker.regional['uk'] = {
        closeText: 'Закрити',
        prevText: '‹',
        nextText: '›',
        currentText: 'Сьогодні',
        monthNames: ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                     'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
        monthNamesShort: ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'],
        dayNames: ['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'],
        dayNamesShort: ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'],
        dayNamesMin: ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'],
        weekHeader: 'Тиж',
        dateFormat: 'dd.mm.yy',
        firstDay: 1,
        isRTL: false,
        showMonthAfterYear: false,
        yearSuffix: ''
    };

});

jQuery(function ($) {

    const $field = $('#form-field-datetravel');
    if (!$field.length) return;

    if ($field.hasClass('hasDatepicker')) return;
	if (/Mobi|Android/i.test(navigator.userAgent)) {
    $field.attr('type', 'date');
} else {
    $field.attr('type', 'text').attr('readonly', 'readonly');

    // Определяем язык сайта по тегу html
    const lang = $('html').attr('lang') || 'ru-RU';

    // Подключаем локаль
    $field.datepicker($.extend({}, $.datepicker.regional[lang], {
        onSelect: function () {
            $(this).trigger('change');
        }
    }));
}

});

// Закрепленный виджет мессенджеров
document.addEventListener('DOMContentLoaded', function () {
  const phoneToggle = document.querySelector('.phone-toggle .elementor-widget-container');
  const phoneWidget = document.querySelector('.phone-widget');

  if (!phoneToggle || !phoneWidget) return;

  phoneToggle.addEventListener('click', function () {
    const isOpen = phoneWidget.classList.contains('active');

    if (!isOpen) {
      // --- ОТКРЫТИЕ ---
      phoneWidget.classList.remove('closing');
      phoneWidget.classList.add('active');

      phoneToggle.style.backgroundColor = '#444444';
    } else {
      // --- ЗАКРЫТИЕ ---
      phoneWidget.classList.add('closing'); // запускаем анимацию

      // ждем завершения transition, потом удаляем active
      setTimeout(() => {
        phoneWidget.classList.remove('active', 'closing');
      }, 400); // совпадает с transition

      phoneToggle.style.backgroundColor = '';
    }
  });
});

// Автопроставление бейджа "Популярный рейс"
// отслеживание кликов
document.addEventListener("DOMContentLoaded", function() {

    // делегируем клики по всему документу
    document.addEventListener('click', function(e) {

        let postId = null;

        // --- 1. Листинг рейсов: клик по jet-listing-dynamic-link ---
        let linkContainer = e.target.closest('.jet-listing-dynamic-link');
        if(linkContainer){
            let postCard = e.target.closest('[data-post-id]');
            if(postCard) postId = postCard.getAttribute('data-post-id');
        }

        // --- 2. Одиночная страница рейса: кнопка .book-btn ---
        if(!postId){
            let bookBtn = e.target.closest('.book-btn');
            if(bookBtn){
                // берём ID рейса из body
                let bodyClass = document.body.className.match(/postid-(\d+)/);
                if(bodyClass) postId = bodyClass[1];
            }
        }

        // --- 3. Одиночная страница рейса: форма .online-bron ---
        if(!postId){
            let onlineForm = e.target.closest('.online-bron');
            if(onlineForm){
                // берём ID рейса из body
                let bodyClass = document.body.className.match(/postid-(\d+)/);
                if(bodyClass) postId = bodyClass[1];
            }
        }

        if(!postId) return; // если ни один селектор не сработал, выходим

        // GitHub Pages/static mode: do not call WordPress admin-ajax.
        // Keep lightweight local analytics only, so clicks do not create 404 errors.
        try {
            const key = 'bez_mezh_route_clicks';
            const stats = JSON.parse(localStorage.getItem(key) || '{}');
            stats[postId] = (stats[postId] || 0) + 1;
            localStorage.setItem(key, JSON.stringify(stats));
        } catch (error) {}
    });

});

(function ($) {

    // =========================
    // 1. Добавление placeholder
    // =========================
    function addPlaceholder(context = document) {
        const selects = context.querySelectorAll('#form-field-reys_class');

        selects.forEach(select => {
            if (!select.querySelector('option[value=""]')) {
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = "Оберіть клас рейсу";
                placeholder.disabled = true;
                placeholder.selected = true;
                placeholder.hidden = true;

                select.insertBefore(placeholder, select.firstChild);
            }
        });
    }

    // =========================
    // 2. Установка значения (ТОЛЬКО в попапе)
    // =========================
    function setClassValueInPopup(value) {
        const popup = document.querySelector('.elementor-popup-modal');

        if (!popup) return;

        const selects = popup.querySelectorAll('#form-field-reys_class');

        selects.forEach(select => {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    // =========================
    // 3. DOM Ready (страница)
    // =========================
    $(document).ready(function () {
        addPlaceholder(document);
    });

    // =========================
    // 4. При открытии попапа Elementor
    // =========================
    $(document).on('elementor/popup/show', function (event, id, instance) {

        const popup = document.querySelector('.elementor-popup-modal');

        if (!popup) return;

        // Добавляем placeholder в попапе
        addPlaceholder(popup);

        // Если ранее выбрали класс — подставляем
        if (window.selectedReysClass) {
            setClassValueInPopup(window.selectedReysClass);
        }
    });

    // =========================
    // 5. Кнопки выбора класса
    // =========================
    $(document).ready(function () {

        $('#btn-comfort').on('click', function () {
            window.selectedReysClass = "Comfort";
        });

        $('#btn-comfort-plus, #btn-lux').on('click', function () {
            window.selectedReysClass = "Lux";
        });

    });

})(jQuery);