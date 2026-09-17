#!/usr/bin/env python3
"""Разовые фиксы: мусор в новых карточках + бренд-иконка PNG."""
import re
import os

BASE = "/home/user/bez-mezh-site"

# 1. Мусор в 20 новых карточках: после валидного атрибута остался хвост
#    вида ` 08:00","18:00"]""=""` (там может быть неразрывный пробел).
p = f"{BASE}/index.html"
h = open(p, encoding="utf-8").read()
GOOD = 'data-departure-times=\'["08:00","18:00"]\''
pat = re.compile(re.escape(GOOD) + r"[\s\u00a0]+08:00[^>]*?=\"\"")
h2, n = pat.subn(GOOD, h)
print("исправлено карточек:", n)
open(p, "w", encoding="utf-8").write(h2)
i = h2.find('data-to-name="Мюнхен"')
s = h2.rfind('<div class="direction-element"', 0, i)
print(h2[s:s + 220])
print("остатки мусора:", h2.count('08:00","18:00"]""'))

# 2. PNG-иконка БЕЗ МЕЖ 180x180
from PIL import Image, ImageDraw, ImageFont
img = Image.new("RGBA", (180, 180), (142, 36, 170, 255))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, 179, 179], radius=38, fill=(142, 36, 170, 255))
big = Image.new("RGBA", (720, 720), (0, 0, 0, 0))
db = ImageDraw.Draw(big)
try:
    fnt = ImageFont.load_default(size=280)
except TypeError:
    fnt = ImageFont.load_default()
db.text((360, 340), "БМ", fill=(255, 255, 255, 255), anchor="mm", font=fnt)
img = Image.alpha_composite(img, big.resize((180, 180), Image.LANCZOS))
img.save(f"{BASE}/images/bezmezh-icon-180.png")
print("OK images/bezmezh-icon-180.png")

# 3. Замена ссылок + удаление старых файлов
for f in ("index.html", "chat.html"):
    fp = f"{BASE}/{f}"
    t = open(fp, encoding="utf-8").read()
    t = t.replace("images/cropped-apple-touch-icon-192x192.png", "images/bezmezh-icon-180.png")
    t = t.replace("images/cropped-apple-touch-icon-180x180.png", "images/bezmezh-icon-180.png")
    t = t.replace("images/cropped-apple-touch-icon-32x32.png", "images/favicon.svg")
    open(fp, "w", encoding="utf-8").write(t)
jp = f"{BASE}/js/chat-app.js"
j = open(jp, encoding="utf-8").read()
j = j.replace("images/cropped-apple-touch-icon-192x192.png", "images/bezmezh-icon-180.png")
open(jp, "w", encoding="utf-8").write(j)
for old in ("images/cropped-apple-touch-icon-180x180.png",
            "images/cropped-apple-touch-icon-192x192.png",
            "images/cropped-apple-touch-icon-32x32.png",
            "images/logo.png", "images/logo-footer.png"):
    try:
        os.remove(f"{BASE}/{old}")
        print("удалён:", old)
    except FileNotFoundError:
        print("нет:", old)
print("ГОТОВО")
