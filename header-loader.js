const headerElement = document.getElementById('header');
if (!headerElement) {
  console.warn('Header placeholder not found.');
} else {
  const headerPath = '/header.html';
  fetch(headerPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load header from ${headerPath}: ${response.status}`);
      }
      return response.text();
    })
    .then((html) => {
      headerElement.innerHTML = html;
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      document.querySelectorAll('.nav-links a').forEach((link) => {
        const href = link.getAttribute('href');
        const linkPage = href.split('/').pop();
        if (linkPage === currentPage) {
          link.classList.add('active');
        }
      });
    })
    .catch((error) => {
      console.error('Header load failed:', error);
    });
}

// Load footer similarly so it can be maintained centrally
const footerPath = '/footer.html';
fetch(footerPath)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load footer from ${footerPath}: ${response.status}`);
    }
    return response.text();
  })
  .then((html) => {
    // Prefer a placeholder element with id "footer", otherwise replace the first <footer>
    let footerEl = document.getElementById('footer');
    if (!footerEl) footerEl = document.querySelector('footer');
    if (footerEl) {
      footerEl.innerHTML = html;
    } else {
      // Append a footer at the end of body
      const f = document.createElement('footer');
      f.innerHTML = html;
      document.body.appendChild(f);
    }
  })
  .catch((error) => {
    console.error('Footer load failed:', error);
  });
