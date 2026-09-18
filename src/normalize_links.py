#!/usr/bin/env python3
"""Універсальна нормалізація посилань копії (тільки src/href атрибути):
- кореневі /xxx -> відносні з урахуванням глибини файлу
- зайві ../.. підйоми (вище кореня) -> обрізати до глибини файлу
"""
import os, re

ROOT = "/home/user/bez-mezh-site"
SKIP_DIRS = {"./.git", "./bot", "./data", "./docs", "./src"}

def file_depth(path):
    rel = os.path.relpath(os.path.dirname(path), ROOT)
    return 0 if rel == "." else len(rel.split(os.sep))

def fix_url(u, d):
    if u.startswith("//") or "://" in u.split("/")[0]:
        return u  # абсолютні URL лишаємо
    if u.startswith("/"):
        rest = u[1:]
        if rest == "":
            return "./"
        return ("../" * d + rest) if d else rest
    m = re.match(r"^((?:\.\./)+)(.*)$", u)
    if m:
        k = m.group(1).count("../")
        rest = m.group(2)
        if k > d:
            return ("../" * d + rest) if d else rest
    return u

def fix_attr(m, d):
    attr, q, u = m.group(1), m.group(2), m.group(3)
    return f"{attr}={q}{fix_url(u, d)}{q}"

changed = 0
for root, ds, fs in os.walk(ROOT):
    rel_root = os.path.relpath(root, ROOT)
    first = rel_root.split(os.sep)[0]
    if rel_root != "." and first in (".git", "bot", "data", "docs", "src"):
        continue
    for f in fs:
        if not f.endswith(".html"):
            continue
        p = os.path.join(root, f)
        d = file_depth(p)
        h = open(p, encoding="utf-8").read()
        h2 = re.sub(r"((?:src|href))=([\"'])((?:(?!\2).)*)\2",
                    lambda m: fix_attr(m, d), h)
        if h2 != h:
            open(p, "w", encoding="utf-8").write(h2)
            changed += 1
print("нормалізовано файлів:", changed)
