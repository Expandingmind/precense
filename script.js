// Landing page — reveal on scroll + auth glue + shrinking nav.

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// Compact-on-scroll nav
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const THRESHOLD = 32;
  let raf = null;
  function apply() {
    raf = null;
    const y = window.scrollY || window.pageYOffset || 0;
    nav.classList.toggle('is-scrolled', y > THRESHOLD);
  }
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }, { passive: true });
  apply();
})();

// If already authed, replace "Sign in" with "Open app" and shortcut the CTA
(async function () {
  if (!window.precenseAuth) return;
  try {
    const session = await window.precenseAuth.getSession();
    if (session) {
      document.querySelectorAll('#nav-signin').forEach((el) => {
        el.textContent = 'Open app';
        el.onclick = () => (window.location.href = '/app/');
      });
    }
  } catch (e) { console.warn('auth check', e.message); }
})();

// Global button handler used by Google/Apple buttons on landing
window.signInWithProvider = async function (provider) {
  try {
    await window.precenseAuth.signInWith(provider);
  } catch (e) {
    alertProviderError(provider, e);
  }
};

function alertProviderError(provider, e) {
  const msg = String(e?.message || e);
  const nice = /provider is not enabled|Unsupported provider/i.test(msg)
    ? `${cap(provider)} sign-in isn't enabled yet. We're still configuring OAuth — hang tight.`
    : `Couldn't start sign-in: ${msg}`;
  // Show inline near the signup card if present, otherwise alert.
  const card = document.getElementById('signin-card') || document.querySelector('.signup-card');
  if (card) {
    let err = card.querySelector('.signin-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'signin-error';
      card.appendChild(err);
    }
    err.textContent = nice;
  } else {
    alert(nice);
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
