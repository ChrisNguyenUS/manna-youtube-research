#!/usr/bin/env python3
"""
Render the Niche Card from positioning.json:

  <stem>-card.html  - self-contained one-page visual (opens in any browser, prints to PDF)
  <stem>-card.png   - the same card as an image (only if Playwright + Chromium are available)

Usage:
  python scripts/build_card.py positioning.json [--out DIR] [--stem NAME] [--no-png]

No dependencies for the HTML. The PNG needs playwright with chromium installed.
"""
import argparse, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "assets" / "niche-card-template.html"


# ---------------------------------------------------------------- Card
def build_card_html(d: dict, out: Path) -> Path:
    tpl = TEMPLATE.read_text(encoding="utf-8")
    payload = json.dumps(d, ensure_ascii=False).replace("</", "<\\/")
    html = tpl.replace("/*__DATA__*/{}", payload, 1)
    out.write_text(html, encoding="utf-8")
    return out


def render_png(html_path: Path, out: Path) -> "Path | None":
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1080, "height": 1200}, device_scale_factor=2)
            pg.goto(html_path.resolve().as_uri())
            pg.wait_for_timeout(200)
            pg.locator("#card").screenshot(path=str(out))
            b.close()
        return out
    except Exception as e:  # browser missing, etc.
        print(f"(PNG skipped: {e})", file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json_path")
    ap.add_argument("--out", default=".")
    ap.add_argument("--stem", default=None)
    ap.add_argument("--no-png", action="store_true")
    a = ap.parse_args()

    d = json.loads(Path(a.json_path).read_text(encoding="utf-8"))
    out_dir = Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)
    stem = a.stem or ("positioning-" + re.sub(r"[^a-z0-9]+", "-", (d.get("person") or d.get("business_name") or "doc").lower()).strip("-"))

    html_p = build_card_html(d, out_dir / f"{stem}-card.html")
    png_p = None if a.no_png else render_png(html_p, out_dir / f"{stem}-card.png")

    print("Niche card:", html_p)
    print("Card PNG:  ", png_p or "(not rendered — open the HTML in a browser and screenshot, or print to PDF)")


if __name__ == "__main__":
    main()
