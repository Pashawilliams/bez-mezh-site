#!/usr/bin/env python3
"""БЕЗ МЕЖ — перенос donor site -> бренд БЕЗ МЕЖ:
1) новые города в поиск + координаты в route-prices.js
2) 20 новых карточек рейсов
3) ребрендинг строк (Eurotour -> БЕЗ МЕЖ)
4) тема: фиолетовый #8e24aa + тёмная шапка/футер
Запуск: python3 src/port_site.py
Идемпотентность НЕ гарантируется — запускать один раз на baseline!
"""
import json, re, os, shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEW_URL = "pashawilliams.github.io/bez-mezh-site"
NEW_SITE = "https://pashawilliams.github.io/bez-mezh-site/"

def load(p):
    with open(f"{BASE}/{p}", encoding="utf-8") as f:
        return f.read()

def save(p, s):
    with open(f"{BASE}/{p}", "w", encoding="utf-8") as f:
        f.write(s)

# ---------- 0. Данные ----------
cities = json.load(open(f"{BASE}/data/cities.json", encoding="utf-8"))
site = json.load(open(f"{BASE}/data/site.json", encoding="utf-8"))
COORD = {c["name"]: (c["lat"], c["lon"]) for c in cities["ua"] + cities["eu"]}
UA_NAMES = set(c["name"] for c in cities["ua"])

# Точки из поиска донора, которых не было в route-prices (id -> (name, lat, lon))
EXTRA_POINTS = {
    "119": ("Броди", 50.0827, 25.1478),
    "118": ("Дубно", 50.3938, 25.7350),
    "36": ("КПП Могилів-Подільський", 48.4433, 27.7861),
    "33": ("Мапп Угринів", 50.5772, 24.0289),
    "111": ("Рава-Руська", 50.2410, 23.6223),
    "132": ("Чоп", 48.4297, 22.2093),
    "112": ("Шегині", 49.7966, 22.9589),
}
HOROL = ("267", "Хорол", 49.7868, 33.271)

# ---------- 1. route-prices.js: города и координаты ----------
rp = load("js/route-prices.js")
m = re.search(r"var UA_CITIES = (\[.*?\]);", rp, re.S)
ua_list = json.loads(m.group(1))
ua_ids = {c["id"]: c["name"] for c in ua_list}
print(f"UA_CITIES было: {len(ua_list)}")
for _id, (nm, la, lo) in EXTRA_POINTS.items():
    assert _id not in ua_ids, f"collision {_id}"
    ua_list.append({"id": _id, "name": nm, "pop": 15000, "lat": la, "lon": lo, "ua": True})
ua_list.append({"id": HOROL[0], "name": HOROL[1], "pop": 13000, "lat": HOROL[2], "lon": HOROL[3], "ua": True})
rp = rp[:m.start(1)] + json.dumps(ua_list, ensure_ascii=False) + rp[m.end(1):]

m = re.search(r"var UA_IDS = (\{.*?\});", rp, re.S)
uids = json.loads(m.group(1))
for _id in list(EXTRA_POINTS) + [HOROL[0]]:
    uids[_id] = 1
rp = rp[:m.start(1)] + json.dumps(uids, ensure_ascii=False) + rp[m.end(1):]

m = re.search(r"var EU_COORDS = (\{.*?\});", rp, re.S)
eu = json.loads(m.group(1))
eu_new = sorted(set(COORD) - UA_NAMES - set(eu))
print(f"EU_COORDS было: {len(eu)}, добавляю: {len(eu_new)}")
for nm in eu_new:
    la, lo = COORD[nm]
    eu[nm] = [la, lo]
rp = rp[:m.start(1)] + json.dumps(eu, ensure_ascii=False) + rp[m.end(1):]
save("js/route-prices.js", rp)
print(f"OK route-prices.js: UA={len(ua_list)} EU={len(eu)}")

# id новых EU городов для селектов
EU_IDS = {nm: str(301 + i) for i, nm in enumerate(eu_new)}
UA_ID_BY_NAME = {c["name"]: c["id"] for c in ua_list}

# ---------- 2. Селекты поиска ----------
html = load("index.html")
for sel in ("search-from", "search-to"):
    m = re.search(r'(<select[^>]*id="' + sel + r'"[^>]*>)(.*?)(</select>)', html, re.S)
    body = m.group(2)
    have = set(re.findall(r"<option[^>]*>([^<]*)</option>", body))
    have = {x.strip() for x in have}
    missing_ua = sorted((set(UA_ID_BY_NAME) - have))
    missing_eu = sorted(set(EU_IDS) - have)
    print(f"{sel}: было опций={len(have)}, +UA={len(missing_ua)} +EU={len(missing_eu)}")
    add = ""
    for nm in missing_ua:
        add += f'\n                                                    <option value="{UA_ID_BY_NAME[nm]}">{nm}</option>'
    for nm in missing_eu:
        add += f'\n                                                    <option value="{EU_IDS[nm]}">{nm}</option>'
    html = html[:m.start(2)] + body + add + "\n                                                " + html[m.end(2):]
save("index.html", html)

EXIST_IDS = {}
_m0 = re.search(r'<select[^>]*id="search-from"[^>]*>(.*?)</select>', load("index.html"), re.S)
for _v, _n in re.findall(r"<option value=\"([^\"]*)\">([^<]*)</option>", _m0.group(1)):
    if _v:
        EXIST_IDS[_n.strip()] = _v

def city_id(nm):
    if nm in UA_ID_BY_NAME:
        return UA_ID_BY_NAME[nm]
    if nm in EXIST_IDS:
        return EXIST_IDS[nm]
    return EU_IDS[nm]

# ---------- 3. Новые карточки ----------
have_cards = set(re.findall(r'data-from-name="([^"]+)"[^>]*data-to-name="([^"]+)"', html))
need = [(r["from"], r["to"]) for r in site["routes"] if (r["from"], r["to"]) not in have_cards]
print(f"Карточек было: {len(have_cards)}, добавить: {len(need)}")

tiers = site["pricing"]["tiers"]
rate = site["pricing"]["eur_rate"]
DUR = site["durations"]

def price_uah(fr, to):
    h = DUR.get(f"{fr}|{to}", {}).get("hours") or DUR.get(f"{to}|{fr}", {}).get("hours")
    if not h:
        return "—"
    for t in tiers:
        if t[0] <= h < t[1]:
            eur = t[2]
            break
    else:
        eur = tiers[-1][2]
    v = round(eur * rate / 50) * 50
    return f"{v:,}".replace(",", " ")

starts = [m.start() for m in re.finditer(r'<div class="direction-element"', html)]
toggle_i = html.find('<div class="direction-sec__toggle-wrap">')
template = html[starts[0]:starts[1]]

_SLUG_MULTI = {"є": "ye", "ж": "zh", "й": "y", "ї": "yi", "х": "kh", "ц": "ts",
                "ч": "ch", "ш": "sh", "щ": "shch", "ю": "yu", "я": "ya", "и": "y", "ь": ""}
_SLUG_SINGLE = str.maketrans("абвгґдезіклмнопрстуф", "abvhgdeziklmnoprstuf")

def slug(s):
    out = []
    for ch in s.lower():
        if ch in _SLUG_MULTI:
            out.append(_SLUG_MULTI[ch])
        elif ch in ("'", "’", " ", "-", "."):
            out.append("-")
        else:
            out.append(ch.translate(_SLUG_SINGLE))
    return re.sub(r"-+", "-", "".join(out)).strip("-")

cards_html = ""
for fr, to in need:
    c = template
    c = re.sub(r'data-from="\d+"', f'data-from="{city_id(fr)}"', c, count=1)
    c = re.sub(r'data-to="\d+"', f'data-to="{city_id(to)}"', c, count=1)
    c = c.replace('data-from-name="Київ"', f'data-from-name="{fr}"')
    c = c.replace('data-to-name="Варшава"', f'data-to-name="{to}"')
    c = re.sub(r'data-stops="[^"]*"\s*', '', c)
    c = re.sub(r'data-departure-times=".*?"', 'data-departure-times=\'["08:00","18:00"]\'', c)
    c = re.sub(r'(direction-location-element__city"[^>]*>\s*)Київ', r'\1' + fr, c)
    c = re.sub(r'(direction-location-element__city"[^>]*>\s*)Варшава', r'\1' + to, c)
    descs = list(re.finditer(r'(direction-location-element__description">)([^<]*)(</p>)', c))
    assert len(descs) == 2, f"desc count: {len(descs)}"
    c = c[:descs[0].start(2)] + "Забираємо за адресою" + c[descs[0].end(2):]
    descs = list(re.finditer(r'(direction-location-element__description">)([^<]*)(</p>)', c))
    c = c[:descs[1].start(2)] + "Довозимо за адресою" + c[descs[1].end(2):]
    p = price_uah(fr, to)
    c = re.sub(r'(direction-element__price"[^>]*data-original-price=")[^"]*(">[^<]*</p>)',
               r'\1від ' + p + r' грн\2', c)
    c = re.sub(r'(<p class="direction-element__price"[^>]*>)[^<]*(</p>)', r'\1від ' + p + r' грн\2', c)
    c = re.sub(r'data-details="[^"]*"', f'data-details="{slug(fr)}-{slug(to)}"', c)
    cards_html += c

html = html[:toggle_i] + cards_html + html[toggle_i:]
print(f"OK карточки: +{len(need)}, статичні ціни пораховано")

# ---------- 4. Ребрендинг index.html ----------
def outside_scripts(h, fn):
    """Застосувати fn до частин поза <script>...</script>."""
    parts = re.split(r"(<script.*?</script>)", h, flags=re.S)
    for i in range(0, len(parts), 2):
        parts[i] = fn(parts[i])
    return "".join(parts)

def brand_text(s):
    s = re.sub(r"<title>.*?</title>",
               "<title>БЕЗ МЕЖ – Пасажирські перевезення Україна – Європа: квитки онлайн | БЕЗ МЕЖ</title>", s)
    s = s.replace("від Eurotour", "від БЕЗ МЕЖ").replace("Eurotour", "БЕЗ МЕЖ")
    s = s.replace("EURO TOUR", "БЕЗ МЕЖ")
    s = s.replace("eurotour.pp.ua", NEW_URL)
    s = s.replace("images/logo.png", "images/bezmezh-logo.png")
    s = s.replace("images/logo-footer.png", "images/bezmezh-logo.png")
    s = s.replace(">50+</b><span>напрямків<", ">70+</b><span>напрямків<")
    return s

html = outside_scripts(html, brand_text)
# favicon
html = re.sub(r'<link rel="icon"[^>]*>\s*', '', html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\s*', '', html)
html = html.replace("</head>",
    '    <link rel="icon" href="images/favicon.svg" type="image/svg+xml">\n</head>')
# bezmezh.css після light-v6.css
html = html.replace("css/light-v6.css",
                    "css/light-v6.css\">\n    <link rel=\"stylesheet\" href=\"css/bezmezh.css", 1)
save("index.html", html)
left = len(re.findall(r"Eurotour", outside_scripts(html, lambda s: s)))
print(f"OK index.html ребрендинг, залишилось Eurotour поза скриптами: {left}")

# ---------- 5. chat.html ----------
ch = load("chat.html")
ch = ch.replace("Eurotour", "БЕЗ МЕЖ").replace("eurotour.pp.ua", NEW_URL)
ch = re.sub(r'<link rel="icon"[^>]*>\s*', '', ch)
ch = ch.replace("</head>",
    '    <link rel="icon" href="images/favicon.svg" type="image/svg+xml">\n</head>')
save("chat.html", ch)
print("OK chat.html")

# ---------- 6. JS/CSS: коментарі + URL ----------
for p in ["js/site-data.js", "js/site-bridge.js", "js/chat-app.js", "js/pricing.js",
          "js/route-prices.js", "js/local-forms.js", "js/local-search.js", "js/managers.js",
          "js/site-modules.js", "js/site-nav.js", "js/theme.js", "js/direction-cards__8a5471f8.js",
          "css/light-v6.css", "css/local-et.css", "css/responsive.css", "css/site-base.css",
          "css/chat.css", "bot/bot.py"]:
    try:
        s = load(p)
    except FileNotFoundError:
        continue
    s = s.replace("eurotour.pp.ua", NEW_URL)
    s = re.sub(r"(/\*[^*]*?)Eurotour([^\/]*?\*/)", r"\1БЕЗ МЕЖ\2", s)
    save(p, s)

s = load("js/site-data.js")
s = s.replace("https://raw.githubusercontent.com/Pashawilliams/site/main/data/site.json",
              "https://raw.githubusercontent.com/Pashawilliams/bez-mezh-site/main/data/site.json")
save("js/site-data.js", s)
print("OK js/css коментарі + URL")

# ---------- 7. Тема: фіолетовий БЕЗ МЕЖ ----------
s = load("css/light-v6.css")
for a, b in [("#4e1986", "#8e24aa"), ("#6e137d", "#6a1b9a"), ("#f1e8fb", "#f3e5f5"),
              ("#424083", "#8e24aa"), ("#5b3f86", "#7b1fa2"), ("#37357b", "#4a148c"),
              ("#5c57b6", "#ab47bc"), ("#5553a2", "#8e24aa"),
              ("78,25,134", "142,36,170")]:
    s = s.replace(a, b)
save("css/light-v6.css", s)
print("OK light-v6.css кольори")

save("css/bezmezh.css", """/* БЕЗ МЕЖ — бренд-шар: темна шапка/футер поверх світлої теми */
header.header, .header { background: #17102b !important; }
.header__nav-list > li > a { color: #fff !important; }
.header__nav-list > li > a:hover, .header__nav-list > li.current-menu-item > a { color: #e1bee7 !important; }
.header__phone-wrapper a, .header__contact-info-wrapper a, .et-header-phone { color: #fff !important; }
.header__phone-subtitle { color: rgba(255,255,255,.65) !important; }
.header__logo-img { height: 44px !important; width: auto !important; }
.burger__sl { background: #fff !important; }
.header__mobile { background: #17102b !important; }
.header__mob-nav-ul a { color: #fff !important; }
.header__mobile-contacts .et-mobile-contact { background: rgba(255,255,255,.08) !important; color: #fff !important; }
.front-sec__banner-sec::before, .front-sec__banner-sec:before { background: linear-gradient(90deg, rgba(26,10,50,.88) 0%, rgba(74,20,120,.55) 50%, rgba(0,0,0,.25) 100%) !important; }
footer, .footer, .footer__top, .footer__down { background: #17102b !important; color: rgba(255,255,255,.8) !important; }
.footer__nav-list a, .footer__nav-down-ul a { color: rgba(255,255,255,.85) !important; }
.footer__copy-text, .footer__contacts-note { color: rgba(255,255,255,.6) !important; }
""")
print("OK css/bezmezh.css")

# ---------- 8. Логотип + фавікон ----------
shutil.copy("/home/user/.tmp-brand/bezmezh-logo.png", f"{BASE}/images/bezmezh-logo.png")
save("images/favicon.svg",
     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#8e24aa"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="#fff" text-anchor="middle">БМ</text></svg>')
print("OK логотип + фавікон")

# ---------- 9. bot.py ----------
b = load("bot/bot.py")
b = b.replace('"Pashawilliams/site"', '"Pashawilliams/bez-mezh-site"')
b = b.replace('"https://eurotour.pp.ua/"', f'"{NEW_SITE}"')
b = b.replace("Eurotour · панель", "БЕЗ МЕЖ · панель")
b = b.replace("eurotour-bot-state-v1", "bezmezh-bot-state-v1")
b = b.replace("eurotour-admin-bot", "bezmezh-admin-bot")
i = b.find("CITY_COORDS = {")
assert i != -1
j = i
depth = 0
for k in range(i, len(b)):
    if b[k] == "{":
        depth += 1
    elif b[k] == "}":
        depth -= 1
        if depth == 0:
            j = k + 1
            break
ALL_COORD = dict(COORD)
ALL_COORD.update({"Броди": (50.0827, 25.1478), "Дубно": (50.3938, 25.7350),
    "КПП Могилів-Подільський": (48.4433, 27.7861), "Мапп Угринів": (50.5772, 24.0289),
    "Рава-Руська": (50.2410, 23.6223), "Чоп": (48.4297, 22.2093),
    "Шегині": (49.7966, 22.9589)})
_lines = ["CITY_COORDS = {"]
for nm in sorted(ALL_COORD):
    la, lo = ALL_COORD[nm]
    _lines.append(f'    "{nm}": ({lo}, {la}),')
_lines.append("}")
b = b[:i] + "\n".join(_lines) + b[j:]
save("bot/bot.py", b)
print("OK bot.py")

# ---------- 10. workflows / robots / sitemap / site.json ----------
d = load(".github/workflows/deploy.yml")
d = d.replace("CNAME ", "")
save(".github/workflows/deploy.yml", d)
t = load(".github/workflows/bot.yml")
t = t.replace("https://eurotour.pp.ua/", NEW_SITE)
save(".github/workflows/bot.yml", t)
r = load("robots.txt")
r = r.replace("eurotour.pp.ua", NEW_URL)
save("robots.txt", r)
save("sitemap.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{NEW_SITE}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>{NEW_SITE}chat.html</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>
""")
save(".nojekyll", "")
# прибрати лінк з анонса (щоб не відкривався в новій вкладці)
sdata = json.load(open(f"{BASE}/data/site.json", encoding="utf-8"))
sdata["site"]["announcement"]["link"] = ""
json.dump(sdata, open(f"{BASE}/data/site.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("OK workflows/robots/sitemap/site.json")
print("ГОТОВО")
