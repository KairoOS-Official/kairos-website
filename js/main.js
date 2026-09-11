// ── Mobile menu toggle ──
const navbarLinks = document.querySelector('.navbar-links');
if (navbarLinks) {
  const toggle = document.createElement('button');
  toggle.textContent = '☰';
  toggle.style.cssText = 'background:none;border:none;color:var(--text-primary);font-size:1.5rem;cursor:pointer;display:none;';
  
  if (window.innerWidth <= 768) {
    toggle.style.display = 'block';
    navbarLinks.style.display = 'none';
  }
  
  toggle.addEventListener('click', () => {
    const visible = navbarLinks.style.display === 'flex';
    navbarLinks.style.display = visible ? 'none' : 'flex';
    navbarLinks.style.flexDirection = 'column';
    navbarLinks.style.position = 'absolute';
    navbarLinks.style.top = '60px';
    navbarLinks.style.right = '1rem';
    navbarLinks.style.background = 'var(--bg-card)';
    navbarLinks.style.padding = '1rem';
    navbarLinks.style.borderRadius = '1rem';
    navbarLinks.style.border = '1px solid var(--border)';
  });
  
  document.querySelector('.navbar')?.appendChild(toggle);
}

// ── Scroll reveal ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.card').forEach(card => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  card.style.transition = 'all 0.6s ease-out';
  observer.observe(card);
});

// ── Active nav link ──
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.navbar-links a').forEach(link => {
  if (link.getAttribute('href')?.includes(currentPage)) {
    link.style.color = 'var(--accent-primary)';
  }
});
