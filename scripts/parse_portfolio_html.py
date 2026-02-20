#!/usr/bin/env python3
"""Parse portfolio HTML and output title, image URL, and link for each item."""
import re
import sys
from pathlib import Path

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--stdin":
        html = sys.stdin.read()
    else:
        html_path = Path(__file__).parent.parent / "portfolio_source.html"
        if len(sys.argv) > 1:
            html_path = Path(sys.argv[1])
        if not html_path.exists():
            print(f"Usage: {sys.argv[0]} [path/to/portfolio.html | --stdin]", file=sys.stderr)
            print(f"Missing: {html_path}", file=sys.stderr)
            sys.exit(1)
        html = html_path.read_text(encoding="utf-8", errors="replace")

    # Split by each portfolio item block (div_block-4-15103-N)
    blocks = re.split(r'<div id="div_block-4-15103-\d+"', html)
    # First segment is preamble, rest are items
    blocks = blocks[1:]

    out = []
    for i, block in enumerate(blocks):
        # Title: text inside ct-headline span
        title_m = re.search(r'<span id="span-225-15124-\d+"[^>]*>([^<]+)</span>', block)
        title = title_m.group(1).strip() if title_m else ""

        # Link: first <a href="..."> (skip empty or #)
        link_m = re.search(r'<a\s+href="([^"]+)"', block)
        link = link_m.group(1).strip() if link_m else ""
        if link in ("", "#"):
            link = ""

        # Image: first img src
        img_m = re.search(r'<img[^>]+src="([^"]+)"', block)
        img = img_m.group(1).strip() if img_m else ""

        out.append({
            "index": i + 1,
            "title": title,
            "image": img,
            "link": link or "(no link)",
        })

    # Print as markdown list
    for o in out:
        print(f"{o['index']}. **{o['title']}**")
        print(f"   - Image: {o['image']}")
        print(f"   - Link:  {o['link']}")
        print()

if __name__ == "__main__":
    main()
