import { el, clear } from './utils.js';

/* ===== Toast ===== */
export function toast(title, opts = {}) {
  const root = document.getElementById('toastRoot');
  const type = opts.type || 'info';
  const icons = { success: 'ph-fill ph-check', error: 'ph-fill ph-warning', info: 'ph-fill ph-info' };
  const node = el('div', { class: `toast toast-${type}` }, [
    el('div', { class: 'ic' }, [el('i', { class: icons[type] || icons.info })]),
    el('div', { class: 'body' }, [
      el('div', { class: 'title' }, [title]),
      opts.sub ? el('div', { class: 'sub' }, [opts.sub]) : null,
    ]),
    el('button', { class: 'close', onclick: () => node.remove() }, [el('i', { class: 'ph ph-x' })]),
  ]);
  root.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; node.style.transition = 'opacity 200ms'; setTimeout(() => node.remove(), 220); }, opts.duration || 3600);
  return node;
}

/* ===== Modal ===== */
export function openModal({ title, subtitle, body, footer, onClose, wide = false, icon } = {}) {
  const root = document.getElementById('modalRoot');
  clear(root);

  const close = () => {
    clear(root);
    document.removeEventListener('keydown', onEsc);
    if (onClose) onClose();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);

  const modal = el('div', { class: 'modal', style: wide ? { maxWidth: '980px' } : {} }, [
    el('div', { class: 'modal-header' }, [
      icon ? el('div', { class: 'w-9 h-9 rounded-lg flex items-center justify-center', style: { background: 'var(--accent-soft)', color: 'var(--accent-hover)' } }, [el('i', { class: icon, style: { fontSize: '17px' } })]) : null,
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: 'text-[15px] font-semibold' }, [title || '']),
        subtitle ? el('div', { class: 'text-[11.5px] mt-0.5', style: { color: 'var(--text-2)' } }, [subtitle]) : null,
      ]),
      el('button', { class: 'btn btn-ghost btn-icon', onclick: close }, [el('i', { class: 'ph ph-x text-[14px]' })]),
    ]),
    el('div', { class: 'modal-body' }, [body]),
    footer ? el('div', { class: 'modal-footer' }, [footer]) : null,
  ]);

  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, [modal]);
  root.appendChild(backdrop);
  setTimeout(() => {
    const first = modal.querySelector('input, textarea, select, [tabindex]');
    if (first) first.focus();
  }, 60);

  return { close };
}

export function closeModal() {
  const root = document.getElementById('modalRoot');
  clear(root);
}

/* ===== Drawer ===== */
export function openDrawer({ content, onClose }) {
  const root = document.getElementById('drawerRoot');
  clear(root);
  const close = () => {
    clear(root);
    document.removeEventListener('keydown', onEsc);
    if (onClose) onClose();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);

  const backdrop = el('div', { class: 'drawer-backdrop', onclick: close });
  const drawer = el('aside', { class: 'drawer' }, [content]);
  root.appendChild(backdrop);
  root.appendChild(drawer);
  return { close, drawer };
}

export function closeDrawer() {
  const root = document.getElementById('drawerRoot');
  clear(root);
}

/* ===== Confirm ===== */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openModal({
      title,
      icon: danger ? 'ph ph-warning-circle' : 'ph ph-question',
      body: el('p', { class: 'text-[13px]', style: { color: 'var(--text-1)' } }, [message]),
      footer: el('div', { class: 'flex items-center gap-2' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => { closeModal(); resolve(false); } }, ['Cancel']),
        el('button', { class: danger ? 'btn btn-destructive' : 'btn btn-primary', onclick: () => { closeModal(); resolve(true); } }, [confirmLabel]),
      ]),
      onClose: () => resolve(false),
    });
  });
}
