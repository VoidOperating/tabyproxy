import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import fetch from 'node-fetch';
import cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(process.cwd(), 'public');
const updateLogPath = path.join(publicDir, 'update-log.json');

app.use(express.static(publicDir));

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

const rewriteHtml = (html, targetUrl) => {
  const $ = cheerio.load(html, { decodeEntities: false });
  const baseUrl = targetUrl.href;

  if ($('base').length === 0) {
    $('head').prepend(`<base href="${baseUrl}">`);
  }

  const selectors = [
    'a[href]',
    'link[href]',
    'script[src]',
    'img[src]',
    'iframe[src]',
    'form[action]',
    'source[srcset]'
  ];

  selectors.forEach((selector) => {
    $(selector).each((_, element) => {
      const attrib = selector.includes('srcset') ? 'srcset' : selector.includes('form') ? 'action' : selector.includes('link') || selector.includes('a') ? 'href' : 'src';
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
        return;
      }

      $(element).attr(attrib, proxiedUrl(value, baseUrl));
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

app.get('/api/logs', async (req, res) => {
  try {
    const data = await fs.readFile(updateLogPath, 'utf-8');
    const logs = JSON.parse(data);
    const stat = await fs.stat(updateLogPath);
    res.json({ updatedAt: stat.mtime.toISOString(), logs });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load update log.' });
  }
});

app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target || !supportedProtocol(target)) {
    return res.status(400).send('Invalid proxy URL. Use an HTTP or HTTPS address.');
  }

  try {
    const targetUrl = new URL(target);
    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'TabyProxy/1.0'
      },
      redirect: 'follow'
    });

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const rewritten = rewriteHtml(html, targetUrl);
      res.type('html').send(rewritten);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('content-type', contentType).send(buffer);
    }
  } catch (error) {
    res.status(500).send('Failed to fetch the requested page.');
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Taby Proxy server running on http://localhost:${PORT}`);
});
