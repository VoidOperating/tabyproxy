// Initialize once DOM is ready to ensure elements exist
document.addEventListener('DOMContentLoaded', () => {
  // Performance optimization - minimize reflows and repaints
  let navigationTimeout;

  // DOM Elements (cached for performance)
  const proxyForm = document.getElementById('proxyForm');
  const targetUrl = document.getElementById('targetUrl');
  const updatesContainer = document.getElementById('updates-list');
  const navButtons = document.querySelectorAll('.hotbar button[data-target]');
  const sections = document.querySelectorAll('.section');

  // Navigation handler - ultra-fast multi-page switching
  function navigateToPage(targetId) {
    clearTimeout(navigationTimeout);

    // Remove active class from all buttons and sections
    navButtons.forEach(btn => btn.classList.remove('active'));
    sections.forEach(sec => sec.classList.remove('active'));

    // Add active class to target
    const button = document.querySelector(`button[data-target="${targetId}"]`);
    const section = document.getElementById(targetId);

    if (button) button.classList.add('active');
    if (section) section.classList.add('active');

    // Scroll to top smoothly
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  // Set Home as active on page load
  navigateToPage('home');

  // Navigation button listeners
  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.target;
      navigateToPage(target);
    });
  });

  // Form submission - handles both searches and URLs
  if (proxyForm) {
    proxyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = targetUrl.value.trim();
      if (!value) return;

      let finalUrl;

      // Check if it's a URL or a search query
      if (value.startsWith('http://') || value.startsWith('https://')) {
        finalUrl = value;
      } else if (value.includes('.') && !value.includes(' ')) {
        // Likely a domain without protocol
        finalUrl = `https://${value}`;
      } else {
        // It's a search query - use Google
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      }

      // Open the site inside the emulator overlay (pre-check then iframe)
      openEmulator(finalUrl);
    });
  }

  // Emulator elements and behavior
  const emulator = document.getElementById('emulator');
  const emulatorFrame = document.getElementById('emulatorFrame');
  const emulatorError = document.getElementById('emulator-error');
  const emulatorOriginalLink = document.getElementById('emulator-original-link');
  const btnClose = document.getElementById('emulator-close');
  const btnReload = document.getElementById('emulator-reload');
  const btnOpen = document.getElementById('emulator-open');
  const btnBack = document.getElementById('emulator-back');
  const btnForward = document.getElementById('emulator-forward');

  let currentOriginalUrl = null;

  function showEmulator() {
    if (!emulator) return;
    emulator.setAttribute('aria-hidden', 'false');
  }

  function hideEmulator() {
    if (!emulator) return;
    emulator.setAttribute('aria-hidden', 'true');
    if (emulatorFrame) emulatorFrame.src = 'about:blank';
    if (emulatorError) emulatorError.hidden = true;
    currentOriginalUrl = null;
  }

  async function openEmulator(originalUrl) {
    currentOriginalUrl = originalUrl;
    const proxied = `/proxy?url=${encodeURIComponent(originalUrl)}`;

    // Optimistically show loader in topbar (could be extended)
    showEmulator();
    if (emulatorError) emulatorError.hidden = true;

    try {
      // Pre-check the proxied response to detect remote 404s or GitHub Pages messages
      const resp = await fetch(proxied, { method: 'GET' });
      const contentType = resp.headers.get('content-type') || '';

      if (resp.status >= 400) {
        // Show friendly error
        showEmulatorError(resp.status, originalUrl);
        return;
      }

      if (contentType.includes('text/html')) {
        const text = await resp.text();
        if (/There isn't a GitHub Pages site here\.|GitHub Pages/.test(text)) {
          showEmulatorError(resp.status || 502, originalUrl);
          return;
        }
      }

      // If pre-check passed, set iframe src to proxied URL (will re-request)
      if (emulatorFrame) {
        emulatorFrame.src = proxied;
        emulatorError.hidden = true;
      }
    } catch (err) {
      console.error('Emulator prefetch error', err);
      showEmulatorError(500, originalUrl);
    }
  }

  function showEmulatorError(status, originalUrl) {
    if (emulatorError) {
      const link = emulatorOriginalLink;
      if (link) {
        link.href = originalUrl;
      }
      emulatorError.hidden = false;
    }
  }

  // Toolbar buttons
  if (btnClose) btnClose.addEventListener('click', hideEmulator);
  if (btnReload) btnReload.addEventListener('click', () => {
    if (emulatorFrame && emulatorFrame.src && emulatorFrame.src !== 'about:blank') {
      emulatorFrame.contentWindow.location.reload();
    }
  });
  if (btnOpen) btnOpen.addEventListener('click', () => {
    if (currentOriginalUrl) window.open(currentOriginalUrl, '_blank', 'noopener');
  });
  if (btnBack) btnBack.addEventListener('click', () => {
    try { emulatorFrame.contentWindow.history.back(); } catch (e) { /* cross-origin may block */ }
  });
  if (btnForward) btnForward.addEventListener('click', () => {
    try { emulatorFrame.contentWindow.history.forward(); } catch (e) { /* cross-origin may block */ }
  });

  // If iframe cannot display due to X-Frame-Options, show error after timeout
  if (emulatorFrame) {
    emulatorFrame.addEventListener('load', () => {
      // hide any previous error
      if (emulatorError) emulatorError.hidden = true;
      // try to update original link if same-origin
      try {
        const loc = emulatorFrame.contentWindow.location.href;
        // if accessible and not about:blank, update currentOriginalUrl
        if (loc && loc !== 'about:blank') currentOriginalUrl = loc;
      } catch (e) {
        // ignore cross-origin access errors
      }
    });
  }

  // Load and display update log - optimized with debouncing
  let updateLogCache = null;
  const loadUpdateLog = async () => {
    try {
      // Use cache if available (performance optimization)
      if (updateLogCache) {
        displayUpdateLog(updateLogCache);
        return;
      }

      const response = await fetch('/api/logs');
      const data = await response.json();

      // Cache the data
      updateLogCache = data;
      displayUpdateLog(data);
    } catch (error) {
      if (updatesContainer) {
        updatesContainer.innerHTML = '<p style="color: #ff69b4;">Unable to load the update log. Check your connection.</p>';
      }
    }
  };

  const displayUpdateLog = (data) => {
    if (!updatesContainer) return;

    if (!Array.isArray(data.logs)) {
      updatesContainer.innerHTML = '<p style="color: #ff69b4;">Update log is not available right now.</p>';
      return;
    }

    const items = data.logs
      .map((entry) => {
        return `
          <article class="log-item">
            <time>${entry.date}</time>
            <strong>${entry.title}</strong>
            <p>${entry.detail}</p>
          </article>
        `;
      })
      .join('');

    updatesContainer.innerHTML = items || '<p style="color: #ff69b4;">No entries yet.</p>';
  };

  // Load update log when page loads (deferred for faster initial render)
  loadUpdateLog();

  // Performance optimization - lazy load images if any
  if ('IntersectionObserver' in window) {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          observer.unobserve(img);
        }
      });
    });
    images.forEach(img => imageObserver.observe(img));
  }
});
