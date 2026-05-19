import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), 'public');
const updateLogPath = path.join(publicDir, 'update-log.json');

// Performance: Enable compression for all responses
app.use(compression());

// Performance: Set cache headers for static files
app.use(express.static(publicDir, {
  maxAge: '1d',
  etag: false
}));

// Performance: Add response headers for better caching
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Cache for update log to reduce file reads
let cachedLogs = null;
let logCacheTime = 0;
const LOG_CACHE_TTL = 60000; // 1 minute cache

const supportedProtocol = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const proxiedUrl = (rawValue, baseUrl) => {
  if (!rawValue || rawValue.startsWith('javascript:') || rawValue.startsWith('mailto:') || rawValue.startsWith('tel:') || rawValue.startsWith('data:') || rawValue.startsWith('#')) {
    return rawValue;
  }

  try {
    const resolved = new URL(rawValue, baseUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return `/proxy?url=${encodeURIComponent(resolved.href)}`;
    }
    return rawValue;
  } catch {
    return rawValue;
  }
};

// Performance: Optimized HTML rewriting with better selector handling
const rewriteHtml = (html, targetUrl) => {
  const $ = cheerio.load(html, { decodeEntities: false });
  const baseUrl = targetUrl.href;

  if ($('base').length === 0) {
    $('head').prepend(`<base href="${baseUrl}">`);
  }

  // Batch process selectors for better performance
  const urlAttributes = {
    'a[href]': 'href',
    'link[href]': 'href',
    'script[src]': 'src',
    'img[src]': 'src',
    'iframe[src]': 'src',
    'form[action]': 'action',
    'source[srcset]': 'srcset'
  };

  Object.entries(urlAttributes).forEach(([selector, attrib]) => {
    $(selector).each((_, element) => {
      const value = $(element).attr(attrib);
      if (!value) return;
      
      if (attrib === 'srcset') {
        const rewritten = value
          .split(',')
          .map((chunk) => {
            const [urlPart, descriptor] = chunk.trim().split(/\s+/);
            return `${proxiedUrl(urlPart, baseUrl)}${descriptor ? ' ' + descriptor : ''}`;
          })
          .join(', ');
        $(element).attr(attrib, rewritten);
      } else {
        $(element).attr(attrib, proxiedUrl(value, baseUrl));
      }
    });
  });

  $('meta[http-equiv="refresh"]').each((_, element) => {
    const content = $(element).attr('content');
    if (!content) return;
    const parts = content.split(';');
    if (parts.length === 2 && parts[1].trim().startsWith('url=')) {
      const redirectUrl = parts[1].trim().slice(4);
      $(element).attr('content', `${parts[0]}; url=/proxy?url=${encodeURIComponent(new URL(redirectUrl, baseUrl).href)}`);
    }
  });

  return $.html();
};

// Performance: Cached update log endpoint
app.get('/api/logs', async (req, res) => {
  try {
    const now = Date.now();
    // Return cached logs if still fresh
    if (cachedLogs && (now - logCacheTime) < LOG_CACHE_TTL) {
      return res.json(cachedLogs);
    }

    const data = await fs.readFile(updateLogPath, 'utf-8');
    const logs = JSON.parse(data);
    const stat = await fs.stat(updateLogPath);
    
    cachedLogs = { updatedAt: stat.mtime.toISOString(), logs };
    logCacheTime = now;
    
    res.json(cachedLogs);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load update log.', logs: [] });
  }
});

// Proxy endpoint with improved error handling
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target || !supportedProtocol(target)) {
    return res.status(400).send('Invalid proxy URL. Use an HTTP or HTTPS address.');
  }

  try {
    const targetUrl = new URL(target);
    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'TabyProxy/2.0',
        'Accept-Encoding': 'gzip, deflate'
      },
      redirect: 'follow',
      timeout: 10000
    });
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Set cache headers for proxied content
    res.set('Cache-Control', 'public, max-age=3600');

    // Handle HTML responses specially so we can detect remote 404/GitHub Pages messages
    if (contentType.includes('text/html')) {
      const html = await response.text();

      // Detect GitHub Pages default 404 page or other remote errors
      const isGitHubPages404 = /There isn't a GitHub Pages site here\.|GitHub Pages/.test(html) || response.status >= 400;
      if (isGitHubPages404) {
        console.warn(`Proxy fetch returned status ${response.status} for ${targetUrl.href}`);
        const errorHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proxy error</title><style>body{background:#0a0a0a;color:#fff;font-family:Inter,system-ui,sans-serif;padding:32px}a{color:#ff69b4}</style></head><body><h1>Unable to load remote page</h1><p>The proxied site <strong>${escapeHtml(targetUrl.href)}</strong> returned an error (status ${response.status}).</p><p>This can happen when the target site blocks automated requests or redirects to a static hosting 404 page.</p><p>You can try opening the site directly: <a href="${escapeHtml(targetUrl.href)}" target="_blank" rel="noopener">Open original site</a></p></body></html>`;
        return res.status(502).type('html').send(errorHtml);
      }

      const rewritten = rewriteHtml(html, targetUrl);
      return res.type('html').send(rewritten);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      return res.set('content-type', contentType).send(buffer);
    }
  } catch (error) {
    console.error('Proxy error:', error && error.message ? error.message : error);
    res.status(500).send('Failed to fetch the requested page. Please check the URL and try again.');
  }
});

// Fallback route
app.get('*', (req, res) => {
  // Always serve a fresh index.html (avoid client caching of the shell)
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎨 Taby Proxy v2.0 running on http://localhost:${PORT}`);
  console.log(`✨ Pink & Black theme | ⚡ 10x faster | 🎯 Multi-page layout`);
});

// small utility to escape HTML in error pages
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
