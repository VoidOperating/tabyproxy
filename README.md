# Taby Proxy

A sleek browser proxy website with a bright orange and white theme, built-in proxy engine, left-side hotbar, and a live update log.

## Features

- Browser proxy UI with URL input
- Built-in proxy route for HTTP/HTTPS websites
- Orange and white gradient wallpaper design
- Rounded cards and orange outline styling
- Live update log loaded from the server

## Open and Use Without Install

1. Open `index.html` directly in your browser.
2. Enter a website URL such as `https://example.com`.
3. Click **Open** to load the proxied page inside the built-in frame.

## Usage

- Enter a URL in the input field
- Click **Open** or press Enter
- The site will use a public CORS bridge to load the page inside the proxy frame
- The update log updates automatically when you navigate to a new page

## Notes

- This version is static and does not require any Node.js installation.
- The fake browser header and kitten favicon are included in the page design.
- Proxy behavior uses an external CORS bridge because browsers do not allow direct cross-origin page fetches from plain static pages.
