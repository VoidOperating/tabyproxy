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
  document.querySelector('.content').scrollTop = 0;
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
  
  // Navigate to proxy with the URL
  window.location.href = `/proxy?url=${encodeURIComponent(finalUrl)}`;
});

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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadUpdateLog);
} else {
  loadUpdateLog();
}

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
