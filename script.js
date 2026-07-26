// Reveal on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// Waitlist form handler (stub — could POST to /api/waitlist later)
window.joinWaitlist = function (formEl) {
  const msg = formEl.parentElement.querySelector('.wl-msg') || document.getElementById('hero-wl-msg');
  if (msg) msg.textContent = 'You’re on the list. Watch your inbox.';
  formEl.querySelector('input').value = '';
};

// Animated chat mockup
const chat = document.getElementById('chat-body');
if (chat) {
  const seq = [
    { side: 'me', type: 'video', label: 'reel_0714.mp4', sub: 'forwarded · 42s' },
    { side: 'me', text: 'why did this one hit?' },
    { side: 'them', text: "Top 8% of your last 30. Your hook lands at 0:00.4 — fastest opener you've ever posted." },
    { side: 'them', text: "The 0:11 reveal matches your pattern-break signature. That combo is your unfair advantage right now." },
    { side: 'them', text: '3 to shoot tomorrow:', hooks: [
      '"the boring version of this hides the good part"',
      '"i tried it wrong first — here\'s what changed"',
      '"one thing nobody edits out"',
    ]},
  ];

  let i = 0;
  const push = () => {
    if (i >= seq.length) return;
    const m = seq[i++];
    const el = document.createElement('div');
    el.className = 'msg ' + m.side + (m.type === 'video' ? ' video' : '');
    if (m.type === 'video') {
      el.innerHTML = `<div class="thumb">▸</div><div class="meta"><strong>${m.label}</strong><br><small>${m.sub}</small></div>`;
    } else {
      el.textContent = m.text;
      if (m.hooks) {
        const wrap = document.createElement('div');
        wrap.className = 'hooks';
        m.hooks.forEach((h) => {
          const s = document.createElement('span');
          s.textContent = h;
          wrap.appendChild(s);
        });
        el.appendChild(wrap);
      }
    }
    chat.appendChild(el);
    setTimeout(push, m.type === 'video' ? 800 : (m.hooks ? 1400 : 1100));
  };

  const start = () => setTimeout(push, 500);
  if ('IntersectionObserver' in window) {
    const io2 = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) { start(); io2.disconnect(); }
    });
    io2.observe(chat);
  } else start();
}
