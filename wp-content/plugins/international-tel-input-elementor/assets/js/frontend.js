/**
 * International Tel Input Frontend Script
 *
 * @package International_Tel_Input_Elementor
 */

jQuery(document).ready(function ($) {
	'use strict';

	function log() {}

	function isAllowedCountry(countryCode) {
		if (!countryCode) {
			return false;
		}
		if (!itiData.allowedCountries || itiData.allowedCountries.length === 0) {
			return true;
		}
		return itiData.allowedCountries.indexOf(countryCode) !== -1;
	}

	function getDefaultCountry() {
		const fallback = (itiData.defaultCountry || 'ru').toLowerCase();
		if (isAllowedCountry(fallback)) {
			return fallback;
		}
		if (itiData.allowedCountries && itiData.allowedCountries.length > 0) {
			return String(itiData.allowedCountries[0]).toLowerCase();
		}
		return 'ru';
	}

	function getCountryFromLanguage() {
		const candidates = [];
		if (navigator.language) {
			candidates.push(navigator.language);
		}
		if (navigator.languages && navigator.languages.length) {
			Array.prototype.push.apply(candidates, navigator.languages);
		}
		for (let i = 0; i < candidates.length; i++) {
			const lang = String(candidates[i] || '').toLowerCase();
			const match = lang.match(/[-_]([a-z]{2})$/i);
			if (match && match[1]) {
				return match[1].toLowerCase();
			}
		}
		return null;
	}

	function getCountryFromTimezone() {
		const tzToCountry = {
			'Europe/Moscow': 'ru',
			'Europe/Kaliningrad': 'ru',
			'Europe/Samara': 'ru',
			'Asia/Yekaterinburg': 'ru',
			'Asia/Omsk': 'ru',
			'Asia/Krasnoyarsk': 'ru',
			'Asia/Irkutsk': 'ru',
			'Asia/Yakutsk': 'ru',
			'Asia/Vladivostok': 'ru',
			'Asia/Magadan': 'ru',
			'Asia/Kamchatka': 'ru',
			'Europe/Kyiv': 'ua',
			'Europe/Minsk': 'by'
		};
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (tz && tzToCountry[tz]) {
				return tzToCountry[tz];
			}
		} catch (e) {
			return null;
		}
		return null;
	}

	function detectCountryWithoutNetwork() {
		const byLanguage = getCountryFromLanguage();
		if (byLanguage && isAllowedCountry(byLanguage)) {
			return byLanguage;
		}
		const byTimezone = getCountryFromTimezone();
		if (byTimezone && isAllowedCountry(byTimezone)) {
			return byTimezone;
		}
		return getDefaultCountry();
	}

	function normalizeIp(value) {
		return String(value || '').trim();
	}

	function isValidIp(value) {
		const ip = normalizeIp(value);
		const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
		const ipv6 = /^[0-9a-f:]+$/i;
		return ipv4.test(ip) || ipv6.test(ip);
	}

	function fetchJsonWithTimeout(url, timeoutMs) {
		return Promise.race([
			fetch(url, { cache: 'no-store' }).then(function(res) {
				if (!res.ok) {
					throw new Error('HTTP ' + res.status);
				}
				return res.json();
			}),
			new Promise(function(_, reject) {
				setTimeout(function() {
					reject(new Error('timeout'));
				}, timeoutMs);
			})
		]);
	}

	function fetchTextWithTimeout(url, timeoutMs) {
		return Promise.race([
			fetch(url, { cache: 'no-store' }).then(function(res) {
				if (!res.ok) {
					throw new Error('HTTP ' + res.status);
				}
				return res.text();
			}),
			new Promise(function(_, reject) {
				setTimeout(function() {
					reject(new Error('timeout'));
				}, timeoutMs);
			})
		]);
	}

	function extractCountryCode(data) {
		if (!data || typeof data !== 'object') {
			return null;
		}
		const candidates = [
			data.country_code,
			data.countryCode,
			data.country,
			data.countryCodeIso2
		];
		for (let i = 0; i < candidates.length; i++) {
			const code = String(candidates[i] || '').trim().toLowerCase();
			if (/^[a-z]{2}$/.test(code)) {
				return code;
			}
		}
		return null;
	}

	function resolveExternalIp() {
		const ipProviders = [
			{
				name: 'ipify',
				getIp: function() {
					return fetchJsonWithTimeout('https://api.ipify.org?format=json', 2200).then(function(data) {
						return data && data.ip;
					});
				}
			},
			{
				name: 'ifconfig',
				getIp: function() {
					return fetchTextWithTimeout('https://ifconfig.me/ip', 2200);
				}
			},
			{
				name: 'ident',
				getIp: function() {
					return fetchTextWithTimeout('https://ident.me', 2200);
				}
			},
			{
				name: 'icanhazip',
				getIp: function() {
					return fetchTextWithTimeout('https://icanhazip.com', 2200);
				}
			},
			{
				name: 'aws_checkip',
				getIp: function() {
					return fetchTextWithTimeout('https://checkip.amazonaws.com', 2200);
				}
			},
			{
				name: 'ip_sb',
				getIp: function() {
					return fetchTextWithTimeout('https://api-ipv4.ip.sb/ip', 2200);
				}
			},
			{
				name: 'seeip',
				getIp: function() {
					return fetchJsonWithTimeout('https://api.seeip.org/jsonip', 2200).then(function(data) {
						return data && (data.ip || data.ip_address);
					});
				}
			}
		];

		let chain = Promise.resolve(null);
		ipProviders.forEach(function(provider) {
			chain = chain.then(function(currentIp) {
				if (isValidIp(currentIp)) {
					return currentIp;
				}
				return provider.getIp()
					.then(function(value) {
						const ip = normalizeIp(value);
						if (isValidIp(ip)) {
							return ip;
						}
						throw new Error('invalid_ip');
					})
					.catch(function() {
						return null;
					});
			});
		});

		return chain.then(function(ip) {
			return isValidIp(ip) ? ip : null;
		});
	}

	function resolveCountryByIp(ip) {
		if (!isValidIp(ip)) {
			return Promise.resolve(null);
		}

		const geoProviders = [
			{
				name: 'ip_api',
				getCountry: function() {
					// Бесплатный ip-api обычно HTTP-only; в HTTPS окружении это может блокироваться mixed content.
					if (window.location && window.location.protocol === 'https:') {
						return Promise.resolve(null);
					}
					return fetchJsonWithTimeout('http://ip-api.com/json/' + encodeURIComponent(ip), 2200)
						.then(extractCountryCode);
				}
			},
			{
				name: 'ipinfo',
				getCountry: function() {
					return fetchJsonWithTimeout('https://ipinfo.io/' + encodeURIComponent(ip) + '/json', 2200)
						.then(extractCountryCode);
				}
			},
			{
				name: 'ipapi',
				getCountry: function() {
					return fetchJsonWithTimeout('https://ipapi.co/' + encodeURIComponent(ip) + '/json', 2200)
						.then(extractCountryCode);
				}
			}
		];

		let chain = Promise.resolve(null);
		geoProviders.forEach(function(provider) {
			chain = chain.then(function(currentCountry) {
				if (currentCountry && isAllowedCountry(currentCountry)) {
					return currentCountry;
				}
				return provider.getCountry()
					.then(function(countryCode) {
						const code = String(countryCode || '').toLowerCase();
						if (code && isAllowedCountry(code)) {
							return code;
						}
						throw new Error('invalid_country');
					})
					.catch(function() {
						return null;
					});
			});
		});

		return chain.then(function(countryCode) {
			return countryCode && isAllowedCountry(countryCode) ? countryCode : null;
		});
	}

	function detectCountryWithServiceChain() {
		return resolveExternalIp()
			.then(function(ip) {
				if (!ip) {
					return null;
				}
				return resolveCountryByIp(ip).then(function(countryCode) {
					if (!countryCode) {
						return null;
					}
					return {
						countryCode: countryCode,
						source: 'service_chain',
						ip: ip
					};
				});
			})
			.catch(function() {
				return null;
			});
	}

	let deferredCountryPromise = null;

	function getDeferredCountryPromise() {
		if (deferredCountryPromise) {
			return deferredCountryPromise;
		}
		deferredCountryPromise = new Promise(function(resolve) {
			const run = function() {
				detectCountryWithServiceChain().then(function(result) {
					resolve(result);
				}).catch(function() {
					resolve(null);
				});
			};

			// Откладываем сетевую geo-цепочку, чтобы не влиять на начальную загрузку страницы.
			if (document.readyState === 'complete') {
				setTimeout(run, 800);
			} else {
				window.addEventListener('load', function() {
					setTimeout(run, 800);
				}, { once: true });
			}
		});
		return deferredCountryPromise;
	}

	function applyDeferredCountryToInput(iti, phoneInput) {
		if (!iti || !phoneInput || !phoneInput.length) {
			return;
		}
		getDeferredCountryPromise().then(function(result) {
			if (!result || !result.countryCode || !isAllowedCountry(result.countryCode)) {
				return;
			}
			sessionStorage.setItem('iti_geo_country', JSON.stringify({
				version: 5,
				countryCode: String(result.countryCode).toLowerCase(),
				source: (result && result.source) ? result.source : 'service_chain',
				ip: (result && result.ip) ? result.ip : null,
				at: Date.now()
			}));
			// Если пользователь уже начал ввод, не меняем страну автоматически.
			if (phoneInput.val() && String(phoneInput.val()).trim() !== '') {
				return;
			}
			const selected = iti.getSelectedCountryData && iti.getSelectedCountryData();
			const currentIso2 = selected && selected.iso2 ? String(selected.iso2).toLowerCase() : '';
			const targetIso2 = String(result.countryCode).toLowerCase();
			if (targetIso2 && currentIso2 !== targetIso2 && typeof iti.setCountry === 'function') {
				iti.setCountry(targetIso2);
			}
		});
	}

	/**
	 * Массив сообщений об ошибках валидации
	 * Индекс соответствует коду ошибки из getValidationError()
	 * Используем переводы из itiData.i18n
	 */
	const errorMap = [
		itiData.i18n.invalidNumber || "Invalid phone number",
		itiData.i18n.invalidCountryCode || "Invalid country code",
		itiData.i18n.tooShort || "Number is too short",
		itiData.i18n.tooLong || "Number is too long",
		itiData.i18n.invalidNumber || "Invalid phone number"
	];

	/**
	 * Validate phone number and show error message
	 * Согласно документации: isValidNumber() проверяет только мобильные номера по умолчанию
	 */
	function validatePhoneNumber(phoneInput, iti) {
		log('validatePhoneNumber called');
		const value = phoneInput.val().trim();
		const itiContainer = phoneInput.closest('.iti');
		if (itiContainer.length) {
			itiContainer.siblings('.iti-error-msg').remove();
		} else {
			phoneInput.siblings('.iti-error-msg').remove();
		}
		phoneInput.removeClass('iti-error iti-valid');
		
		if (!value) {
			log('validatePhoneNumber: empty value, return true');
			return true;
		}
		
		log('validatePhoneNumber: checking isValidNumber');
		// isValidNumber() возвращает true только для валидных мобильных номеров
		if (iti.isValidNumber && typeof iti.isValidNumber === 'function') {
			if (iti.isValidNumber()) {
				log('validatePhoneNumber: valid');
				phoneInput.addClass('iti-valid');
				return true;
			} else {
				log('validatePhoneNumber: invalid, errorCode=', iti.getValidationError ? iti.getValidationError() : 'n/a');
				// Получаем код ошибки для более детального сообщения
				const errorCode = iti.getValidationError && typeof iti.getValidationError === 'function' 
					? iti.getValidationError() 
					: -1;
				const errorMsg = errorMap[errorCode] || errorMap[0];
				
				// Показываем сообщение об ошибке
				phoneInput.addClass('iti-error');
				const errorElement = $('<span class="iti-error-msg">' + errorMsg + '</span>');
				
				// Вставляем сообщение после контейнера .iti
				if (itiContainer.length) {
					// Удаляем старое сообщение, если есть
					itiContainer.siblings('.iti-error-msg').remove();
					// Вставляем новое сообщение после контейнера
					itiContainer.after(errorElement);
				} else {
					// Fallback: если контейнер не найден, вставляем после input
					phoneInput.after(errorElement);
				}
				
				return false;
			}
		} else {
			log('validatePhoneNumber: isValidNumber not available');
			phoneInput.addClass('iti-error');
			const errorElement = $('<span class="iti-error-msg">' + (itiData.i18n.validationError || 'Error: validation script not loaded.') + '</span>');
			if (itiContainer.length) {
				itiContainer.siblings('.iti-error-msg').remove();
				itiContainer.after(errorElement);
			} else {
				phoneInput.after(errorElement);
			}
			return false;
		}
	}

	/**
	 * Initialize intl-tel-input on all tel fields
	 * @param {jQuery|Element|undefined} scope - Optional container (e.g. popup element). If not set, runs on whole document.
	 */
	function initIntlTelInput(scope) {
		const $scope = (scope && (scope instanceof $ || (scope && scope.nodeType)))
			? (scope instanceof $ ? scope : $(scope))
			: $(document);
		log('initIntlTelInput called', scope ? 'scope=' + (scope.nodeName || (scope && scope.length)) : 'document');
		var telInputs = $scope.find('input[type="tel"]');
		log('initIntlTelInput: found input[type=tel] count=', telInputs.length);
		var isDocumentScope = !scope || (scope === document) || (scope && scope.nodeType === 9);
		telInputs.each(function () {
			const phoneInput = $(this);
			const form = phoneInput.closest('form');
			if (!form.length) {
				log('initIntlTelInput: skip input (no form)', phoneInput[0]);
				return;
			}
			if (phoneInput.closest('.iti').length) {
				log('initIntlTelInput: skip input (already .iti)', phoneInput[0]);
				return;
			}
			// При инициализации по всему документу не трогаем поля внутри попапа — их инициализируем при открытии попапа с dropdownContainer: body
			if (isDocumentScope && phoneInput.closest('.elementor-location-popup, .elementor-popup-modal').length) {
				log('initIntlTelInput: skip input inside popup (will init when popup opens)', phoneInput[0]);
				return;
			}
			log('initIntlTelInput: initializing input', phoneInput[0], 'name=', phoneInput.attr('name'));

			try {
				// В попапе — список внутри модалки, чтобы клик по нему не закрывал попап; иначе — в body (z-index/обрезка)
				var popupModal = phoneInput.closest('.elementor-popup-modal')[0] || null;
				var dropdownContainer = popupModal || document.body;

				const options = {
					separateDialCode: itiData.separateDialCode || true,
					autoPlaceholder: itiData.autoPlaceholder || 'off',
					utilsScript: itiData.utilsScriptUrl,
					preferredCountries: ['ru', 'ua', 'by'], // Предпочитаемые страны
					dropdownContainer: dropdownContainer
				};

				// Добавляем переводы для выпадающего списка стран
				if (itiData.i18n) {
					options.i18n = {
					searchPlaceholder: itiData.i18n.searchPlaceholder || 'Search',
					noResults: itiData.i18n.noResults || 'No results found'
					};
				}

				// Разрешенные страны (если выбраны, показываем только их)
				if (itiData.allowedCountries && itiData.allowedCountries.length > 0) {
					options.onlyCountries = itiData.allowedCountries;
				}
				// Если ничего не выбрано, показываем все страны (не устанавливаем onlyCountries)

				// Настройка начальной страны без внешних API-запросов
				if (itiData.enableIpDetection) {
					options.initialCountry = 'auto';
					
					// Полностью локальное определение: язык + таймзона браузера.
					// Сначала сервисная цепочка IP/Geo, затем fallback на язык + таймзону.
					options.geoIpLookup = function(callback) {
						const CACHE_VERSION = 5;
						const cached = sessionStorage.getItem('iti_geo_country');
						if (cached) {
							let parsed = null;
							try {
								parsed = JSON.parse(cached);
							} catch (e) {
								parsed = null;
							}
							if (parsed && (parsed.countryCode || parsed.country_code)) {
								const cachedCountryCode = String(parsed.countryCode || parsed.country_code).toLowerCase();
								if (parsed.version === CACHE_VERSION && isAllowedCountry(cachedCountryCode)) {
									callback(cachedCountryCode);
									return;
								}
							}
						}
						// Возвращаем страну мгновенно, без ожидания сети.
						const detectedCountryCode = detectCountryWithoutNetwork();
						sessionStorage.setItem('iti_geo_country', JSON.stringify({
							version: CACHE_VERSION,
							countryCode: detectedCountryCode,
							source: 'browser_locale_timezone',
							at: Date.now()
						}));
						callback(detectedCountryCode);
					};
				} else {
					// IP определение отключено, используем страну по умолчанию
					options.initialCountry = getDefaultCountry();
				}

				if (typeof window.intlTelInput !== 'undefined') {
					log('initIntlTelInput: calling intlTelInput(this, options)');
					const iti = window.intlTelInput(this, options);
					log('initIntlTelInput: intlTelInput inited OK', phoneInput.attr('name'));
					phoneInput.data('iti', iti);
					this.itiInstance = iti;
					if (itiData.enableIpDetection) {
						applyDeferredCountryToInput(iti, phoneInput);
					}

					// Функция для установки padding-left с !important
					const setPaddingLeftImportant = function() {
						const inputElement = phoneInput[0];
						if (inputElement) {
							const currentPaddingLeft = inputElement.style.paddingLeft;
							if (currentPaddingLeft) {
								// Устанавливаем padding-left с !important через setProperty
								inputElement.style.setProperty('padding-left', currentPaddingLeft, 'important');
							}
						}
					};

					// Устанавливаем padding-left с !important сразу после инициализации
					setTimeout(setPaddingLeftImportant, 0);

					// Перехватываем изменения padding-left через MutationObserver
					const observer = new MutationObserver(function(mutations) {
						mutations.forEach(function(mutation) {
							if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
								setPaddingLeftImportant();
							}
						});
					});

					// Наблюдаем за изменениями атрибута style
					observer.observe(phoneInput[0], {
						attributes: true,
						attributeFilter: ['style']
					});

					phoneInput.on('countrychange', function() {
						log('countrychange event', phoneInput.attr('name'));
						setTimeout(setPaddingLeftImportant, 0);
					});

					// Валидация в реальном времени и блокировка кнопки отправки
					// Флаг для отслеживания, было ли показано сообщение об обязательном поле
					let requiredErrorShown = false;
					
					const updateValidation = function(showRequiredError = false) {
						const value = phoneInput.val().trim();
						const form = phoneInput.closest('form');
						const submitBtn = form.find(':submit');
						
						// Удаляем предыдущие сообщения об ошибках и валидности
						const itiContainer = phoneInput.closest('.iti');
						if (itiContainer.length) {
							itiContainer.siblings('.iti-error-msg').remove();
							itiContainer.siblings('.iti-valid-msg').remove();
						} else {
							phoneInput.siblings('.iti-error-msg').remove();
							phoneInput.siblings('.iti-valid-msg').remove();
						}
						phoneInput.removeClass('iti-error iti-valid');
						
						// Если поле пустое
						if (!value) {
							// Если поле обязательное, блокируем кнопку (если включено в настройках)
							const isRequired = phoneInput.prop('required') || phoneInput.attr('required') !== undefined;
							if (isRequired && itiData.blockSubmitIfInvalid) {
								if (submitBtn.length) {
									submitBtn.prop('disabled', true);
								}
								
								// Показываем ошибку только если явно запрошено (при клике на кнопку) или уже было показано
								if (showRequiredError || requiredErrorShown) {
									phoneInput.addClass('iti-error');
									const errorElement = $('<span class="iti-error-msg">' + (itiData.i18n.fieldRequired || 'Field is required') + '</span>');
									if (itiContainer.length) {
										itiContainer.after(errorElement);
									} else {
										phoneInput.after(errorElement);
									}
									requiredErrorShown = true;
								}
							} else {
								// Если не обязательное, проверяем другие поля
								checkAllPhonesAndDisableButton(form);
							}
							return;
						}
						
						// Если поле заполнено, сбрасываем флаг
						requiredErrorShown = false;
						
						// Валидируем номер в реальном времени
						if (iti.isValidNumber && typeof iti.isValidNumber === 'function') {
							if (iti.isValidNumber()) {
								// Номер валидный
								phoneInput.removeClass('iti-error').addClass('iti-valid');
								
								// Показываем сообщение о валидности (зеленое с галочкой)
								const validElement = $('<span class="iti-valid-msg">' + (itiData.i18n.validNumber || '✓ Valid number') + '</span>');
								if (itiContainer.length) {
									itiContainer.siblings('.iti-valid-msg').remove();
									itiContainer.siblings('.iti-error-msg').remove();
									itiContainer.after(validElement);
								} else {
									phoneInput.siblings('.iti-valid-msg').remove();
									phoneInput.siblings('.iti-error-msg').remove();
									phoneInput.after(validElement);
								}
								
								// Проверяем все поля и разблокируем кнопку если все валидны
								checkAllPhonesAndDisableButton(form);
							} else {
								// Номер невалидный
								phoneInput.removeClass('iti-valid').addClass('iti-error');
								if (itiData.blockSubmitIfInvalid && submitBtn.length) {
									submitBtn.prop('disabled', true);
								}
								
								// Удаляем сообщение о валидности
								if (itiContainer.length) {
									itiContainer.siblings('.iti-valid-msg').remove();
								} else {
									phoneInput.siblings('.iti-valid-msg').remove();
								}
								
								// Показываем сообщение об ошибке
								const errorCode = iti.getValidationError && typeof iti.getValidationError === 'function' 
									? iti.getValidationError() 
									: -1;
								const errorMsg = errorMap[errorCode] || errorMap[0];
								const errorElement = $('<span class="iti-error-msg">' + errorMsg + '</span>');
								
								if (itiContainer.length) {
									itiContainer.after(errorElement);
								} else {
									phoneInput.after(errorElement);
								}
							}
						} else {
							// Если isValidNumber недоступен, блокируем кнопку (если включено в настройках)
							phoneInput.addClass('iti-error');
							if (itiData.blockSubmitIfInvalid && submitBtn.length) {
								submitBtn.prop('disabled', true);
							}
							const errorElement = $('<span class="iti-error-msg">' + (itiData.i18n.validationError || 'Error: validation script not loaded.') + '</span>');
							if (itiContainer.length) {
								itiContainer.after(errorElement);
							} else {
								phoneInput.after(errorElement);
							}
						}
					};
					
					// Сохраняем функцию updateValidation для доступа извне (для показа ошибки при клике на кнопку)
					phoneInput.data('updateValidation', updateValidation);
					
					// Обработчики событий для валидации в реальном времени
					phoneInput.on('input keyup countrychange', function() {
						updateValidation(false); // Не показываем ошибку обязательного поля при вводе
					});
					
					// При потере фокуса также валидируем (но не показываем ошибку обязательного поля)
					phoneInput.on('blur', function() {
						updateValidation(false);
					});
					
					// Store full number on change (для использования при отправке)
					phoneInput.on('countrychange input', function() {
						const fullNumber = iti.getNumber();
						if (fullNumber) {
							$(this).data('fullNumber', fullNumber);
						}
					});
				} else {
					log('initIntlTelInput: window.intlTelInput is undefined, skip');
				}
			} catch (error) {
				log('initIntlTelInput: catch error', error);
			}
		});
		log('initIntlTelInput done');
	}

	/**
	 * Resolve Elementor popup DOM element from event detail or from visible modal in DOM
	 */
	function getElementorPopupContainer(eventOrDetail) {
		log('getElementorPopupContainer called', eventOrDetail);
		let container = null;
		const detail = eventOrDetail && eventOrDetail.detail ? eventOrDetail.detail : eventOrDetail;
		log('getElementorPopupContainer detail=', detail, 'detail.instance=', detail && detail.instance);
		if (detail && detail.instance) {
			const inst = detail.instance;
			if (inst.$element && inst.$element.length) {
				container = inst.$element[0] || inst.$element;
				log('getElementorPopupContainer: from inst.$element');
			} else if (inst.element) {
				container = inst.element;
				log('getElementorPopupContainer: from inst.element');
			}
		}
		if (!container) {
			const $modal = $('.elementor-popup-modal:visible, .elementor-popup-modal.elementor-popup-modal-open').last();
			log('getElementorPopupContainer: fallback $modal.length=', $modal.length);
			if ($modal.length) {
				container = $modal[0];
			}
		}
		log('getElementorPopupContainer result', container ? 'found ' + (container.nodeName || '') : 'null');
		return container;
	}

	/**
	 * Init forms (tel inputs). Used on DOM ready and when popup is shown.
	 * @param {Element|jQuery|undefined} popupContainer - optional popup container to init only inside it
	 */
	function initForms(popupContainer) {
		log('initForms called', popupContainer ? 'with container' : 'no container (document)');
		setTimeout(function() {
			log('initForms: setTimeout 100ms fired, calling initIntlTelInput');
			initIntlTelInput(popupContainer || document);
		}, 100);
	}

	// Initialize on DOM ready
	log('DOM ready, calling initForms()');
	initForms();

	/**
	 * Get popup container from event (jQuery or native) and run init inside it.
	 */
	function initIntlTelInputInPopup(popupContainer) {
		log('initIntlTelInputInPopup', popupContainer ? 'container' : 'document');
		initForms(popupContainer);
	}

	// Единый обработчик попапов: Elementor + Jet Popup (правильный способ для работы в попапе и инкогнито)
	$(document).on('elementor/popup/show jet-popup/show-event/after-show', function(event, popupDocument, popupId, domEvent) {
		const eventType = event.type || (event.detail && 'elementor/popup/show');
		log('popup event (jQuery): type=', eventType, 'popupDocument=', popupDocument, 'popupId=', popupId, 'domEvent=', domEvent);
		var container = null;
		if (event.type === 'elementor/popup/show' || eventType === 'elementor/popup/show') {
			var instance = popupDocument;
			log('elementor branch: instance=', instance, 'instance.$element=', instance && instance.$element, 'instance.element=', instance && instance.element);
			if (instance && (instance.$element || instance.element)) {
				container = (instance.$element && instance.$element[0]) ? instance.$element[0] : (instance.element || null);
				log('elementor: container from instance=', container);
			}
			if (!container) {
				log('elementor: container null, calling getElementorPopupContainer');
				container = getElementorPopupContainer(event);
			}
			log('elementor/popup/show final container', container);
		}
		if (!container && (event.type === 'jet-popup/show-event/after-show' || eventType === 'jet-popup/show-event/after-show')) {
			log('jet-popup/show-event/after-show, no container -> initForms(undefined)');
		}
		log('popup handler: calling initForms(container)', container ? 'with container' : 'undefined');
		initForms(container || undefined);
	});
	log('bound $(document).on("elementor/popup/show jet-popup/show-event/after-show")');

	// Native CustomEvent для Elementor Pro 3.9+ (иногда срабатывает только он, например в инкогнито)
	if (typeof window !== 'undefined') {
		log('adding native listener elementor/popup/show');
		window.addEventListener('elementor/popup/show', function(event) {
			log('native elementor/popup/show fired', event, 'event.detail=', event.detail);
			var container = getElementorPopupContainer(event);
			log('native handler: container=', container, 'calling initIntlTelInputInPopup');
			initIntlTelInputInPopup(container);
		});
	}

	// Fallback: init when Elementor popup modal is inserted into DOM
	if (typeof MutationObserver !== 'undefined' && document.body) {
		log('MutationObserver: observing document.body for elementor-popup-modal');
		var popupObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
				if (mutation.addedNodes && mutation.addedNodes.length) {
					for (var i = 0; i < mutation.addedNodes.length; i++) {
						var node = mutation.addedNodes[i];
						if (node.nodeType === 1 && node.classList && node.classList.contains('elementor-popup-modal')) {
							log('MutationObserver: elementor-popup-modal added to DOM', node);
							initIntlTelInputInPopup(node);
							break;
						}
					}
				}
			});
		});
		popupObserver.observe(document.body, { childList: true, subtree: true });
	}

	/** Последнее поле, по которому открыли выпадающий список (dropdown в body, не внутри .iti) */
	var lastOpenedTelInput = null;

	/**
	 * Позиционирует выпадающий список стран строго под полем телефона (для попапа/мобилки при dropdownContainer: body)
	 * @param {HTMLInputElement} [inputEl] — поле телефона; если не передано, используется lastOpenedTelInput или activeElement
	 */
	function positionCountryDropdownUnderInput(inputEl) {
		var dropdown = document.querySelector('.iti__dropdown-content');
		if (!dropdown) return;
		var input = inputEl || lastOpenedTelInput || (document.activeElement && document.activeElement.type === 'tel' && document.activeElement.closest && document.activeElement.closest('.iti') ? document.activeElement : null);
		if (!input) return;
		var rect = input.getBoundingClientRect();
		dropdown.style.position = 'fixed';
		dropdown.style.top = rect.bottom + 'px';
		dropdown.style.left = rect.left + 'px';
		log('positionCountryDropdownUnderInput: top=', rect.bottom, 'left=', rect.left);
	}

	$(document).on('click', '.iti__selected-country, .iti__selected-dial-code, .iti__flag-container', function() {
		var $iti = $(this).closest('.iti');
		if (!$iti.length) return;
		var input = $iti.find('input[type="tel"]')[0];
		if (input) lastOpenedTelInput = input;
		document.body.classList.add('iti-dropdown-positioning');
		function tryPositionAndShow() {
			var dropdown = document.querySelector('.iti__dropdown-content');
			if (!dropdown) return false;
			positionCountryDropdownUnderInput(input);
			requestAnimationFrame(function() {
				document.body.classList.remove('iti-dropdown-positioning');
			});
			return true;
		}
		if (tryPositionAndShow()) return;
		var attempts = 0;
		var t = setInterval(function() {
			if (tryPositionAndShow() || ++attempts > 40) {
				clearInterval(t);
				if (attempts > 40) document.body.classList.remove('iti-dropdown-positioning');
			}
		}, 5);
	});

	$(document).on('scroll', '.elementor-popup-modal, .elementor-popup-modal .dialog-content, .elementor-popup-modal .elementor', function() {
		var dropdown = document.querySelector('.iti__dropdown-content');
		if (dropdown && dropdown.offsetParent !== null) {
			positionCountryDropdownUnderInput();
		}
	});

	/* Запасной вариант: клик по списку в body не должен закрывать попап (если список всё же в body) */
	function isInsideItiDropdown(el) {
		return el && el.nodeType === 1 && (el.classList && el.classList.contains('iti__dropdown-content') || (el.closest && el.closest('.iti__dropdown-content')));
	}
	$(document).on('click mousedown', '.iti__dropdown-content, .iti__dropdown-content *', function(e) {
		e.stopPropagation();
	});

	/**
	 * Проверяет все поля телефона и блокирует/разблокирует кнопку отправки
	 */
	function checkAllPhonesAndDisableButton(form) {
		log('checkAllPhonesAndDisableButton', form[0], 'blockSubmitIfInvalid=', itiData.blockSubmitIfInvalid);
		if (!itiData.blockSubmitIfInvalid) {
			log('checkAllPhonesAndDisableButton: blockSubmit disabled, return true');
			return true;
		}

		let allValid = true;
		const submitBtn = form.find(':submit');
		
		form.find('input[type="tel"]').each(function() {
			const phoneInput = $(this);
			const iti = phoneInput.data('iti');
			
			if (iti) {
				const value = phoneInput.val().trim();
				const isRequired = phoneInput.prop('required') || phoneInput.attr('required') !== undefined;
				
				// Если поле обязательное и пустое
				if (isRequired && !value) {
					allValid = false;
					return false; // break
				}
				
				// Если поле заполнено, проверяем валидность
				if (value) {
					if (iti.isValidNumber && typeof iti.isValidNumber === 'function') {
						if (!iti.isValidNumber()) {
							allValid = false;
							return false; // break
						}
					} else {
						allValid = false;
						return false; // break
					}
				}
			}
		});
		
		if (submitBtn.length) {
			submitBtn.prop('disabled', !allValid);
		}
		log('checkAllPhonesAndDisableButton result allValid=', allValid);
		return allValid;
	}

	/**
	 * Validate all phone fields in form
	 */
	function validateAllPhones(form) {
		log('validateAllPhones', form[0]);
		let isValid = true;
		let firstInvalidField = null;
		
		form.find('input[type="tel"]').each(function() {
			const phoneInput = $(this);
			const iti = phoneInput.data('iti');
			
			if (iti) {
				const value = phoneInput.val().trim();
				const isRequired = phoneInput.prop('required') || phoneInput.attr('required') !== undefined;
				
				// Если поле пустое и обязательное
				if (!value && isRequired) {
					phoneInput.addClass('iti-error');
					const errorElement = $('<span class="iti-error-msg">' + (itiData.i18n.fieldRequired || 'Field is required') + '</span>');
					const itiContainer = phoneInput.closest('.iti');
					if (itiContainer.length) {
						itiContainer.siblings('.iti-error-msg').remove();
						itiContainer.after(errorElement);
					} else {
						phoneInput.siblings('.iti-error-msg').remove();
						phoneInput.after(errorElement);
					}
					isValid = false;
					if (!firstInvalidField) {
						firstInvalidField = phoneInput;
					}
				}
				// Если поле заполнено, валидируем номер
				else if (value) {
					if (!validatePhoneNumber(phoneInput, iti)) {
						isValid = false;
						// Сохраняем первое невалидное поле для прокрутки
						if (!firstInvalidField) {
							firstInvalidField = phoneInput;
						}
					}
				}
			}
		});
		
		if (!isValid && firstInvalidField) {
			$('html, body').animate({
				scrollTop: firstInvalidField.offset().top - 100
			}, 300);
		}
		log('validateAllPhones result isValid=', isValid);
		return isValid;
	}

	/**
	 * Update phone values before form submission
	 */
	function updatePhoneValues(form) {
		log('updatePhoneValues', form[0]);
		form.find('input[type="tel"]').each(function() {
			const phoneInput = $(this);
			const iti = phoneInput.data('iti');
			
				if (iti && typeof iti.getNumber === 'function') {
				const fullNumber = iti.getNumber();
				if (fullNumber) {
					log('updatePhoneValues: set fullNumber', fullNumber, 'for', phoneInput.attr('name'));
					phoneInput.val(fullNumber);
					// Также обновляем через нативный setter для надежности
					if (phoneInput[0]) {
						phoneInput[0].value = fullNumber;
						// Триггерим событие change для Elementor
						phoneInput.trigger('change');
					}
				}
			}
		});
	}

	/**
	 * Показать ошибки для всех пустых полей телефона в форме
	 */
	function showRequiredErrors(form) {
		log('showRequiredErrors', form[0]);
		let hasErrors = false;
		let firstErrorField = null;
		
		form.find('input[type="tel"]').each(function() {
			const phoneInput = $(this);
			const iti = phoneInput.data('iti');
			if (iti) {
				const value = phoneInput.val().trim();
				const isRequired = phoneInput.prop('required') || phoneInput.attr('required') !== undefined;
				
				// Проверяем все поля телефона (если они пустые, считаем обязательными)
				if (!value) {
					// Показываем ошибку
					const itiContainer = phoneInput.closest('.iti');
					phoneInput.addClass('iti-error');
					
					// Удаляем предыдущие сообщения
					if (itiContainer.length) {
						itiContainer.siblings('.iti-error-msg').remove();
						itiContainer.siblings('.iti-valid-msg').remove();
					} else {
						phoneInput.siblings('.iti-error-msg').remove();
						phoneInput.siblings('.iti-valid-msg').remove();
					}
					
					// Показываем сообщение об ошибке
					const errorElement = $('<span class="iti-error-msg">' + (itiData.i18n.fieldRequired || 'Field is required') + '</span>');
					if (itiContainer.length) {
						itiContainer.after(errorElement);
					} else {
						phoneInput.after(errorElement);
					}
					
					// Вызываем updateValidation с флагом показа ошибки (чтобы установить флаг)
					const updateValidation = phoneInput.data('updateValidation');
					if (updateValidation && typeof updateValidation === 'function') {
						updateValidation(true);
					}
					
					hasErrors = true;
					if (!firstErrorField) {
						firstErrorField = phoneInput;
					}
				}
			}
		});
		
		// Прокручиваем к первому полю с ошибкой
		if (hasErrors && firstErrorField) {
			$('html, body').animate({
				scrollTop: firstErrorField.offset().top - 100
			}, 300);
		}
		
		log('showRequiredErrors result hasErrors=', hasErrors);
		return hasErrors;
	}


	// Handle standard form submission with validation
	$(document).on('submit', 'form', function(e) {
		const form = $(this);
		log('submit form (generic)', form[0], form.attr('class'));
		if (!checkAllPhonesAndDisableButton(form)) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
		
		// Если валидация прошла, обновляем значения
		updatePhoneValues(form);
	});

	$(document).on('submit', '.elementor-form', function(e) {
		const form = $(this);
		log('submit .elementor-form', form[0]);
		if (!checkAllPhonesAndDisableButton(form)) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
		
		updatePhoneValues(form);
	});

	$(document).on('submit', 'form.elementor-form', function(e) {
		const form = $(this);
		log('submit form.elementor-form', form[0]);
		if (!checkAllPhonesAndDisableButton(form)) {
			e.preventDefault();
			e.stopPropagation();
			return false;
		}
		
		updatePhoneValues(form);
	});

	$(document).on('submit', 'form', function(e) {
		const form = $(this);
		if (form.hasClass('elementor-form') || form.closest('.elementor-form').length) {
			log('submit form (elementor check)', form[0]);
			if (!checkAllPhonesAndDisableButton(form)) {
				e.preventDefault();
				e.stopPropagation();
				return false;
			}
			updatePhoneValues(form);
		}
	});


	$(document).on('submit', '.elementor-form', function (e) {
		const form = $(this);
		log('submit .elementor-form (immediate)', form[0]);
		if (!checkAllPhonesAndDisableButton(form)) {
			e.preventDefault();
			e.stopImmediatePropagation();
			return false;
		}

		updatePhoneValues(form);
	});


	if (typeof elementorFrontend !== 'undefined' && elementorFrontend.hooks) {
		log('elementorFrontend.hooks: adding frontend/element_ready/form.default');
		elementorFrontend.hooks.addAction('frontend/element_ready/form.default', function($scope) {
			log('element_ready form.default', $scope[0]);
			const form = $scope.find('form');
			if (form.length) {
				form.on('submit', function(e) {
					log('submit (element_ready form.default)', form[0]);
					const formEl = $(this);
					
					// Проверяем все поля и блокируем если невалидно
					if (!checkAllPhonesAndDisableButton(formEl)) {
						e.preventDefault();
						e.stopPropagation();
						return false;
					}
					
					updatePhoneValues(formEl);
				});
			}
		});
	} else {
		log('elementorFrontend or elementorFrontend.hooks not found');
	}
});

