#!/usr/bin/env python3
"""Нормалізація нових сторінок копії: ?ver геть, абсолютні внутрішні лінки -> відносні."""
import os, re, urllib.parse, urllib.request

ROOT = "/home/user/bez-mezh-site"
TARGETS = ["/", "/reys/", "/reys/kyiv-miunkhen/", "/reys/miunkhen-kyiv/", "/reys/kyiv-dortmund/",
    "/kategorіja_rejsu/v-ukrainu/", "/kategorіja_rejsu/u-nimechchenu/",
    "/kategorіja_rejsu/do-niderlandiv/", "/kategorіja_rejsu/do-belhii/",
    "/kategorіja_rejsu/v-chekhiiu/",
    "/transfer/", "/o-nas/", "/klientam/", "/chasti-pytannia/", "/avtopark-2/", "/novyny/",
    "/kontakty/", "/karta-sajta/", "/politika-konfidencialnosti/",
    "/porady-turystam-u-nimechchyni/", "/pravila-vvezennya-domashnih-tvarin-u-nimechchinu/",
    "/prybuttia-vazhlyva-informatsiia-dlia-bizhentsiv-z-ukrainy/"]

def rel_link(page_path, target):
    tdir = target.strip("/")
    pdir = os.path.relpath(os.path.dirname(page_path), ROOT)
    if pdir == ".":
        pdir = ""
    if tdir == "":
        depth = 0 if not pdir else len(pdir.split("/"))
        return "./" if depth == 0 else "../" * depth
    rel = os.path.relpath(tdir, pdir if pdir else ".")
    return rel + "/"

def norm_page(p):
    h = open(p, encoding="utf-8").read()
    # ?ver геть
    h = re.sub(r"%3Fver=[^\"'&\s)]+", "", h)
    h = re.sub(r"\?ver=[^\"'&\s)]+", "", h)
    # глибина сторінки для відносних шляхів
    d = os.path.dirname(p)
    rel_d = os.path.relpath(d, ROOT)
    depth = 0 if rel_d == "." else len(rel_d.split(os.sep))
    prefix = "" if depth == 0 else "../" * depth
    for asset in ("wp-content/", "wp-includes/"):
        h = h.replace("https://bez-mezh.com.ua/" + asset, prefix + asset)
    for t in TARGETS:
        for form in ("https://bez-mezh.com.ua" + t, "https://bez-mezh.com.ua" + urllib.parse.quote(t)):
            if form in h:
                h = h.replace(form, rel_link(p, t))
    # cart/trash: абсолютні посилання на заглублені /reys/... яких ще нема — лишаємо як є (згенеруємо пізніше)
    open(p, "w", encoding="utf-8").write(h)

pages = ["porady-turystam-u-nimechchyni/index.html",
         "pravila-vvezennya-domashnih-tvarin-u-nimechchinu/index.html",
         "prybuttia-vazhlyva-informatsiia-dlia-bizhentsiv-z-ukrainy/index.html"]
for pg in pages:
    norm_page(os.path.join(ROOT, pg))
print("нормалізовано:", len(pages))

# Докачати відсутні файли, на які посилаються нові сторінки
missing = {}
for pg in pages:
    d = os.path.join(ROOT, os.path.dirname(pg))
    h = open(os.path.join(ROOT, pg), encoding="utf-8").read()
    for m in re.finditer(r"(?:src|href)=\"([^\"]+)\"", h):
        u = m.group(1)
        if u.startswith(("http", "#", "mailto:", "tel:", "data:", "viber:", "whatsapp:", "//")) or u == "":
            continue
        u = u.split("#")[0].split("?")[0]
        if not u or u.endswith("/"):
            continue
        local = os.path.normpath(os.path.join(d, u))
        if not os.path.exists(local) and local not in missing:
            rel = os.path.relpath(local, ROOT)
            missing[local] = "https://bez-mezh.com.ua/" + rel

print("докачати:", len(missing))
for local, url in sorted(missing.items()):
    try:
        os.makedirs(os.path.dirname(local), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r, open(local, "wb") as f:
            f.write(r.read())
        print("OK", os.path.relpath(local, ROOT))
    except Exception as e:
        print("FAIL:", url, str(e)[:100])
print("ГОТОВО")
