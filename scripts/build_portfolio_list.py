#!/usr/bin/env python3
"""Build portfolio_list.txt from embedded HTML (paste full HTML below)."""
import re

# PASTE THE FULL PORTFOLIO HTML BELOW (between the triple quotes):
HTML = """
<div id="_dynamic_list-3-15103" class="oxy-dynamic-list"></div>
"""

def main():
    if not HTML.strip() or "div_block-4-15103-2" not in HTML:
        print("Paste the full portfolio HTML into the HTML variable in this script.", file=__import__("sys").stderr)
        return
    blocks = re.split(r'<div id="div_block-4-15103-\d+"', HTML)
    blocks = blocks[1:]
    out = []
    for i, block in enumerate(blocks):
        title_m = re.search(r'<span id="span-225-15124-\d+"[^>]*>([^<]+)</span>', block)
        title = title_m.group(1).strip() if title_m else ""
        link_m = re.search(r'<a\s+href="([^"]+)"', block)
        link = (link_m.group(1).strip() if link_m else "").strip()
        if link in ("", "#"):
            link = "(no link)"
        img_m = re.search(r'<img[^>]+src="([^"]+)"', block)
        img = img_m.group(1).strip() if img_m else ""
        out.append((i + 1, title, img, link))
    path = __import__("pathlib").Path(__file__).parent.parent / "portfolio_list.txt"
    with open(path, "w", encoding="utf-8") as f:
        for i, title, img, link in out:
            f.write(f"{i}. **{title}**\n")
            f.write(f"   - Image: {img}\n")
            f.write(f"   - Link:  {link}\n\n")
    print(f"Wrote {len(out)} items to {path}")

if __name__ == "__main__":
    main()
