# Rib vs Bit — SEO + GEO Kit

Four files, all drop-in ready for a Phaser/Netlify static site.

## 1. `llms.txt`
Place at the site root: `/llms.txt` (so it resolves to `https://rib-vs-bit.netlify.app/llms.txt`).
This is the GEO equivalent of a robots.txt — a plain-language summary AI answer engines (ChatGPT, Perplexity, etc.) can read to describe your game accurately.

## 2. `head-snippet.html`
Merge the contents into the `<head>` of your `index.html`. Covers:
- Real `<title>` and meta description (SEO)
- Open Graph + Twitter card tags (link previews when shared)
- JSON-LD `VideoGame` structured data (GEO — this is what LLMs and rich-result crawlers parse)

Two placeholders to fill in once you have a promo image:
- `og:image`
- `twitter:image`
A 1200x630px screenshot or title-card image works well.

## 3. `robots.txt`
Place at site root: `/robots.txt`. Points crawlers to the sitemap and allows full indexing.

## 4. `sitemap.xml`
Place at site root: `/sitemap.xml`. Single-page site for now — add more `<url>` entries if you add pages (e.g. a devlog or "Super Turbo" page later).

## Deploy
Since you're on Netlify, drop `llms.txt`, `robots.txt`, and `sitemap.xml` into your `public/` (or static assets) folder so they get served at the root, and merge `head-snippet.html` into your existing `index.html` `<head>`. Redeploy as usual.

## Next reps (optional, later)
- Add a short "How to Play" or "About" text block to the page itself — right now there's almost no crawlable body text beyond the controls list.
- When "Super Turbo" ships, add a second sitemap entry and a devlog post — that's a natural backlink/content opportunity for SEO.
