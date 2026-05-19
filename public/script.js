const proxyForm = document.getElementById('proxyForm');
const targetUrl = document.getElementById('targetUrl');
const updatesContainer = document.getElementById('updates');
const navButtons = document.querySelectorAll('.hotbar button[data-target]');

proxyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = targetUrl.value.trim();
  if (!value) return;
  const normalizedUrl = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  window.location.href = `/proxy?url=${encodeURIComponent(normalizedUrl)}`;
});

async function loadUpdateLog() {
  try {
    const response = await fetch('/api/logs');
    const data = await response.json();

    if (!Array.isArray(data.logs)) {
      updatesContainer.innerHTML = '<p>Update log is not available right now.</p>';
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

    updatesContainer.innerHTML = items || '<p>No entries yet.</p>';
  } catch (error) {
    updatesContainer.innerHTML = '<p>Unable to load the update log.</p>';
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

loadUpdateLog();
