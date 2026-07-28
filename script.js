// Landing page — reveal on scroll + waitlist stub
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

window.joinWaitlist = function (formEl) {
  const msg = formEl.parentElement.querySelector('.wl-msg') || document.getElementById('hero-wl-msg');
  if (msg) msg.textContent = "You're on the list. Watch your inbox.";
  formEl.querySelector('input').value = '';
};
