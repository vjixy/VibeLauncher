import { el, mount, timeAgo, extractTemplateVars, renderTemplate, copyToClipboard, escapeHtml } from '../utils.js';
import { state, getPrompt } from '../state.js';
import { renderSidebar, renderHeader, panelBlock, iconRow, colorForIndex } from '../chrome.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export function renderPrompts(ctx) {
  const ps = state.promptsView;
  renderSidebar({ ...ctx, contextPanel: buildSidebar(ctx) });
  renderHeader({
    title: 'Prompts',
    subtitle: subtitle(),
    onPalette: ctx.onPalette,
    onSearch: (v) => { ps.search = v; renderPrompts(ctx); },
    searchValue: ps.search,
    searchPlaceholder: 'Search prompts by title, body, or variable…',
    actions: [
      el('button', { class: 'btn btn-primary', onclick: () => openPromptModal(null, ctx) }, [el('i', { class: 'ph ph-plus text-[13px]' }), 'New Prompt']),
    ],
  });

  const content = document.getElementById('appContent');
  const prompts = filterPrompts();

  if (state.prompts.length === 0) {
    mount(content, el('div', { class: 'empty-state' }, [
      el('div', { class: 'ic', style: { background: 'var(--cyan-soft)', color: 'var(--cyan)' } }, [el('i', { class: 'ph ph-chat-circle-text' })]),
      el('h3', {}, ['No prompts yet']),
      el('p', {}, ['Create a text template or a multi-turn chat. Use {{variables}} for placeholders.']),
      el('button', { class: 'btn btn-primary', onclick: () => openPromptModal(null, ctx) }, [el('i', { class: 'ph ph-plus' }), 'New prompt']),
    ]));
    return;
  }

  mount(content, el('section', { style: { padding: '24px' } }, [
    el('div', { class: 'flex items-center gap-2 mb-5 flex-wrap' }, [
      ...topTagPills(ctx),
      el('div', { class: 'ml-auto flex items-center gap-2' }, [
        el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, ['Sort']),
        el('div', { class: 'field', style: { height: '28px' } }, [
          el('select', { onchange: (e) => { ps.sort = e.target.value; renderPrompts(ctx); } }, [
            el('option', { value: 'recent', selected: ps.sort === 'recent' }, ['Last used']),
            el('option', { value: 'alpha', selected: ps.sort === 'alpha' }, ['Alphabetical']),
            el('option', { value: 'favorites', selected: ps.sort === 'favorites' }, ['Favorites first']),
          ]),
        ]),
      ]),
    ]),
    prompts.length === 0
      ? el('div', { class: 'empty-state' }, [el('p', {}, ['No prompts match your filter.'])])
      : el('div', { class: 'grid grid-cols-3 gap-3' }, prompts.map(p => promptCard(p, ctx))),
  ]));
}

function subtitle() {
  const n = state.prompts.length;
  const favs = state.prompts.filter(p => p.favorite).length;
  const text = state.prompts.filter(p => p.format === 'text').length;
  const chat = state.prompts.filter(p => p.format === 'chat').length;
  return `${n} total · ${favs} favorited · ${text} text · ${chat} chat`;
}

function buildSidebar(ctx) {
  const ps = state.promptsView;
  const tagCounts = new Map();
  state.prompts.forEach(p => (p.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const favorites = state.prompts.filter(p => p.favorite).length;
  const recent = state.prompts.filter(p => p.updatedAt && (Date.now() - new Date(p.updatedAt).getTime()) < 7 * 86400000).length;
  const text = state.prompts.filter(p => p.format === 'text').length;
  const chat = state.prompts.filter(p => p.format === 'chat').length;

  return el('div', { class: 'flex flex-col gap-4 flex-1 min-h-0' }, [
    panelBlock('Filter', null, [
      iconRow({ icon: 'ph-squares-four', label: 'All', count: state.prompts.length, active: ps.filter === 'all' && !ps.tag && !ps.format, onclick: () => { ps.filter = 'all'; ps.tag = null; ps.format = null; renderPrompts(ctx); } }),
      iconRow({ icon: 'ph-fill ph-star', iconColor: 'var(--amber)', label: 'Favorites', count: favorites, active: ps.filter === 'favorites', onclick: () => { ps.filter = 'favorites'; ps.tag = null; ps.format = null; renderPrompts(ctx); } }),
      iconRow({ icon: 'ph-clock-counter-clockwise', label: 'Recent', count: recent, active: ps.filter === 'recent', onclick: () => { ps.filter = 'recent'; ps.tag = null; ps.format = null; renderPrompts(ctx); } }),
    ]),
    panelBlock('Format', null, [
      el('button', { class: `ws-row ${ps.format === 'text' ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick: () => { ps.format = ps.format === 'text' ? null : 'text'; renderPrompts(ctx); } }, [
        el('span', { class: 'pill pill-sm fmt-text mono' }, ['TEXT']), el('span', { class: 'count' }, [String(text)]),
      ]),
      el('button', { class: `ws-row ${ps.format === 'chat' ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick: () => { ps.format = ps.format === 'chat' ? null : 'chat'; renderPrompts(ctx); } }, [
        el('span', { class: 'pill pill-sm fmt-chat mono' }, ['CHAT']), el('span', { class: 'count' }, [String(chat)]),
      ]),
    ]),
    panelBlock('Tags', null, [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count], i) =>
      el('button', { class: `ws-row ${ps.tag === tag ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick: () => { ps.tag = ps.tag === tag ? null : tag; renderPrompts(ctx); } }, [
        el('span', { class: 'ws-bar', style: { background: colorForIndex(i) } }),
        el('span', { class: 'truncate-1' }, [tag]),
        el('span', { class: 'count' }, [String(count)]),
      ])
    )),
  ]);
}

function topTagPills(ctx) {
  const ps = state.promptsView;
  const tagCounts = new Map();
  state.prompts.forEach(p => (p.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const top = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return [
    el('button', { class: `pill ${!ps.tag ? 'pill-accent' : ''}`, onclick: () => { ps.tag = null; renderPrompts(ctx); } }, ['All tags']),
    ...top.map(([tag]) => el('button', { class: `pill ${ps.tag === tag ? 'pill-accent' : ''}`, onclick: () => { ps.tag = tag; renderPrompts(ctx); } }, [tag])),
  ];
}

function filterPrompts() {
  const ps = state.promptsView;
  let out = [...state.prompts];
  const q = ps.search.trim().toLowerCase();
  if (q) {
    out = out.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.template || '').toLowerCase().includes(q) || (p.tags || []).some(t => t.toLowerCase().includes(q)));
  }
  if (ps.filter === 'favorites') out = out.filter(p => p.favorite);
  else if (ps.filter === 'recent') out = out.filter(p => p.updatedAt && (Date.now() - new Date(p.updatedAt).getTime()) < 7 * 86400000);
  if (ps.tag) out = out.filter(p => (p.tags || []).includes(ps.tag));
  if (ps.format) out = out.filter(p => p.format === ps.format);
  if (ps.sort === 'alpha') out.sort((a, b) => a.title.localeCompare(b.title));
  else if (ps.sort === 'favorites') out.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  else out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return out;
}

function promptCard(p, ctx) {
  const vars = p.format === 'text' ? extractTemplateVars(p.template) : extractVarsFromMessages(p.messages);
  return el('div', { class: 'card card-hover pc', onclick: () => openPromptDetail(p, ctx) }, [
    el('div', { class: 'flex items-start justify-between' }, [
      el('div', { class: 'flex items-center gap-2' }, [
        el('span', { class: `pill pill-sm ${p.format === 'chat' ? 'fmt-chat' : 'fmt-text'} mono` }, [p.format.toUpperCase()]),
        vars.length > 0 ? el('span', { class: 'pill pill-sm' }, [el('i', { class: 'ph ph-brackets-curly text-[10px]' }), `${vars.length} var${vars.length !== 1 ? 's' : ''}`]) : null,
      ]),
      el('button', {
        class: `star-btn ${p.favorite ? 'on' : ''}`,
        onclick: async (e) => { e.stopPropagation(); await api.updatePrompt(p.id, { ...p, favorite: !p.favorite }); await ctx.refresh(); },
      }, [el('i', { class: `${p.favorite ? 'ph-fill' : 'ph'} ph-star text-[14px]` })]),
    ]),
    el('h3', { class: 'text-[14.5px] font-semibold mt-2.5' }, [p.title]),
    p.description ? el('p', { class: 'truncate-2 text-[12px] mt-1', style: { color: 'var(--text-2)' } }, [p.description]) : null,
    el('div', { class: 'mt-auto pt-3 flex items-center justify-between' }, [
      el('div', { class: 'flex items-center gap-1' }, (p.tags || []).slice(0, 2).map(t => el('span', { class: 'tag' }, [t]))),
      el('span', { class: 'text-[11px]', style: { color: 'var(--text-2)' } }, [p.updatedAt ? timeAgo(p.updatedAt) : '']),
    ]),
    el('div', { class: 'pc-actions' }, [
      el('button', { class: 'btn btn-ghost btn-icon', style: { height: '28px', width: '28px' }, title: 'Copy', onclick: async (e) => { e.stopPropagation(); const text = p.format === 'text' ? p.template : p.messages.map(m => `${m.role}: ${m.content}`).join('\n\n'); await copyToClipboard(text); toast('Copied'); } }, [el('i', { class: 'ph ph-copy text-[12px]' })]),
      el('button', { class: 'btn btn-ghost btn-icon', style: { height: '28px', width: '28px' }, title: 'Duplicate', onclick: async (e) => { e.stopPropagation(); await api.duplicatePrompt(p.id); await ctx.refresh(); toast('Duplicated'); } }, [el('i', { class: 'ph ph-copy-simple text-[12px]' })]),
      el('button', { class: 'btn btn-ghost btn-icon', style: { height: '28px', width: '28px' }, title: 'Edit', onclick: (e) => { e.stopPropagation(); openPromptModal(p, ctx); } }, [el('i', { class: 'ph ph-pencil-simple text-[12px]' })]),
    ]),
  ]);
}

function extractVarsFromMessages(messages) {
  return [...new Set((messages || []).flatMap(m => extractTemplateVars(m.content)))];
}

function openPromptDetail(p, ctx) {
  let activeTab = 'template';
  const vars = p.format === 'text' ? extractTemplateVars(p.template) : extractVarsFromMessages(p.messages);
  const example = { ...(p.exampleVariables || {}) };
  vars.forEach(v => { if (!(v in example)) example[v] = ''; });

  const content = el('div', { class: 'flex flex-col', style: { height: '100vh' } });

  function renderBody() {
    const body = el('div', { class: 'flex-1 overflow-y-auto', style: { padding: '20px' } });
    if (activeTab === 'template') body.appendChild(templateTab());
    else if (activeTab === 'rendered') body.appendChild(renderedTab());
    else if (activeTab === 'example') body.appendChild(el('pre', { class: 'json-out' }, [JSON.stringify(p.exampleVariables, null, 2)]));
    else if (activeTab === 'notes') body.appendChild(el('div', { class: 'text-[13px] whitespace-pre-wrap' }, [p.notes || '(no notes)']));
    content.querySelector('.tab-body')?.replaceWith(Object.assign(body, { className: 'flex-1 overflow-y-auto tab-body' }));
  }

  function templateTab() {
    if (p.format === 'chat') {
      return el('div', { class: 'flex flex-col gap-3' }, (p.messages || []).map(m =>
        el('div', { class: `chat-bubble role-${m.role}` }, [
          el('div', { class: 'label-sm mb-1' }, [m.role]),
          el('div', { class: 'text-[13px] mono whitespace-pre-wrap' }, [m.content]),
        ])
      ));
    }
    return el('pre', { class: 'json-out', style: { whiteSpace: 'pre-wrap' } }, [p.template || '']);
  }

  function renderedTab() {
    const varInputs = el('div', { class: 'flex flex-col gap-2 mb-4' }, vars.map(v => {
      const input = document.createElement('input');
      input.value = example[v] || '';
      input.oninput = () => { example[v] = input.value; renderBody(); };
      return el('div', { class: 'grid gap-2', style: { gridTemplateColumns: '140px 1fr' } }, [
        el('div', { class: 'label-sm', style: { padding: '8px 0' } }, [v]),
        el('div', { class: 'field' }, [input]),
      ]);
    }));
    let out;
    if (p.format === 'chat') {
      out = el('div', { class: 'flex flex-col gap-3' }, (p.messages || []).map(m =>
        el('div', { class: `chat-bubble role-${m.role}` }, [
          el('div', { class: 'label-sm mb-1' }, [m.role]),
          el('div', { class: 'text-[13px] whitespace-pre-wrap' }, [renderTemplate(m.content, example)]),
        ])
      ));
    } else {
      out = el('pre', { class: 'json-out', style: { whiteSpace: 'pre-wrap' } }, [renderTemplate(p.template || '', example)]);
    }
    return el('div', {}, [
      vars.length > 0 ? varInputs : null,
      out,
      el('button', { class: 'btn btn-primary mt-3', onclick: async () => {
        const text = p.format === 'chat' ? p.messages.map(m => `${m.role}: ${renderTemplate(m.content, example)}`).join('\n\n') : renderTemplate(p.template, example);
        await copyToClipboard(text);
        toast('Rendered prompt copied');
      } }, [el('i', { class: 'ph ph-copy' }), 'Copy rendered']),
    ]);
  }

  const { close } = openModal({
    title: p.title,
    subtitle: `${p.format.toUpperCase()}${vars.length ? ` · ${vars.length} variable${vars.length !== 1 ? 's' : ''}` : ''}`,
    icon: p.format === 'chat' ? 'ph ph-chat-circle-text' : 'ph ph-article',
    wide: true,
    body: (() => {
      const tabs = ['template', 'rendered', 'example', 'notes'];
      const tabsRow = el('div', { class: 'tabs-row', style: { padding: 0, margin: '-20px -20px 0' } }, tabs.map(t =>
        el('div', { class: `tab ${activeTab === t ? 'active' : ''}`, style: { marginLeft: '20px' }, onclick: () => { activeTab = t; document.querySelectorAll('.modal .tab').forEach(x => x.classList.toggle('active', x.textContent.trim().toLowerCase() === t)); renderBody(); } }, [t[0].toUpperCase() + t.slice(1)])
      ));
      content.appendChild(tabsRow);
      content.appendChild(el('div', { class: 'tab-body flex-1 overflow-y-auto', style: { padding: '20px' } }));
      renderBody();
      return content;
    })(),
    footer: el('div', { class: 'flex items-center gap-2' }, [
      el('button', { class: 'btn btn-ghost', onclick: async () => { await api.duplicatePrompt(p.id); await ctx.refresh(); close(); toast('Duplicated'); } }, ['Duplicate']),
      el('button', { class: 'btn btn-destructive', onclick: async () => { const ok = await confirmDialog({ title: 'Delete prompt?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }); if (!ok) return; await api.deletePrompt(p.id); close(); await ctx.refresh(); toast('Deleted'); } }, ['Delete']),
      el('button', { class: 'btn btn-secondary', onclick: () => { close(); openPromptModal(p, ctx); } }, ['Edit']),
      el('button', { class: 'btn btn-primary', onclick: async () => { await copyToClipboard(p.format === 'text' ? p.template : p.messages.map(m => `${m.role}: ${m.content}`).join('\n\n')); toast('Copied'); } }, [el('i', { class: 'ph ph-copy' }), 'Copy template']),
    ]),
  });
}

export function openPromptModal(existing, ctx) {
  const isNew = !existing;
  const p = existing || { title: '', description: '', tags: [], format: 'text', template: '', messages: [{ role: 'user', content: '' }], exampleVariables: {}, exampleOutput: '', notes: '', favorite: false };
  let format = p.format;

  const titleInput = mkInput(p.title);
  const descInput = mkInput(p.description);
  const tagsInput = mkInput((p.tags || []).join(', '));
  const templateTextarea = mkTextarea(p.template, 10);
  let messages = [...(p.messages || []).map(m => ({ ...m }))];
  if (format === 'chat' && messages.length === 0) messages = [{ role: 'user', content: '' }];
  const exampleVarsTextarea = mkTextarea(JSON.stringify(p.exampleVariables || {}, null, 2), 4);
  const exampleOutputTextarea = mkTextarea(p.exampleOutput, 3);
  const notesTextarea = mkTextarea(p.notes, 3);

  const formatSegment = el('div', { class: 'seg', style: { width: '100%' } }, ['text', 'chat'].map(f =>
    el('button', { class: `flex-1 justify-center ${format === f ? 'active' : ''}`, onclick: (e) => { e.preventDefault(); format = f; rerender(); } }, [f.toUpperCase()])
  ));

  const bodyContainer = el('div', { class: 'flex flex-col gap-3' });
  const messagesContainer = el('div', { class: 'flex flex-col gap-2' });

  function renderMessages() {
    messagesContainer.innerHTML = '';
    messages.forEach((m, i) => {
      const roleSelect = document.createElement('select');
      ['system', 'user', 'assistant'].forEach(r => {
        const opt = document.createElement('option'); opt.value = r; opt.textContent = r;
        if (m.role === r) opt.selected = true;
        roleSelect.appendChild(opt);
      });
      roleSelect.onchange = () => { messages[i].role = roleSelect.value; };
      const contentArea = mkTextarea(m.content, 3);
      contentArea.oninput = () => { messages[i].content = contentArea.value; };
      messagesContainer.appendChild(el('div', { class: 'grid gap-2', style: { gridTemplateColumns: '120px 1fr 32px' } }, [
        el('div', { class: 'field', style: { alignSelf: 'flex-start' } }, [roleSelect]),
        el('div', { class: 'field field-block' }, [contentArea]),
        el('button', { class: 'btn btn-ghost btn-icon', onclick: (e) => { e.preventDefault(); messages.splice(i, 1); if (messages.length === 0) messages.push({ role: 'user', content: '' }); renderMessages(); } }, [el('i', { class: 'ph ph-x text-[12px]' })]),
      ]));
    });
    messagesContainer.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start' }, onclick: (e) => { e.preventDefault(); messages.push({ role: 'user', content: '' }); renderMessages(); } }, [el('i', { class: 'ph ph-plus text-[11px]' }), 'Add message']));
  }

  function rerender() {
    formatSegment.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === format));
    bodyContainer.innerHTML = '';
    if (format === 'text') {
      bodyContainer.appendChild(el('div', {}, [el('div', { class: 'label-sm mb-1' }, ['Template']), el('div', { class: 'field field-block' }, [templateTextarea])]));
    } else {
      renderMessages();
      bodyContainer.appendChild(el('div', {}, [el('div', { class: 'label-sm mb-1' }, ['Messages']), messagesContainer]));
    }
  }

  rerender();

  openModal({
    title: isNew ? 'New prompt' : 'Edit prompt',
    icon: 'ph ph-chat-circle-text',
    wide: true,
    body: el('div', { class: 'grid grid-cols-2 gap-6' }, [
      el('div', { class: 'flex flex-col gap-3' }, [
        fieldWrap(titleInput, 'Title', { required: true }),
        fieldWrap(descInput, 'Description'),
        fieldWrap(tagsInput, 'Tags (comma-separated)'),
        el('div', {}, [
          el('div', { class: 'label-sm mb-1' }, ['Format']),
          formatSegment,
        ]),
        el('label', { class: 'flex items-center gap-2 mt-1 text-[12.5px]' }, [
          el('input', { type: 'checkbox', id: 'favChk', checked: !!p.favorite }),
          el('span', {}, ['Favorite']),
        ]),
      ]),
      el('div', { class: 'flex flex-col gap-3' }, [
        bodyContainer,
      ]),
    ]),
    footer: el('div', { class: 'flex items-center gap-2' }, [
      el('button', { class: 'btn btn-ghost', onclick: closeModal }, ['Cancel']),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        let exampleVariables = {};
        try { exampleVariables = JSON.parse(exampleVarsTextarea.value || '{}'); } catch { return toast('Example variables must be valid JSON', { type: 'error' }); }
        const body = {
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
          format,
          template: format === 'text' ? templateTextarea.value : '',
          messages: format === 'chat' ? messages.filter(m => m.content.trim()) : [],
          exampleVariables,
          exampleOutput: exampleOutputTextarea.value,
          notes: notesTextarea.value,
          favorite: document.getElementById('favChk').checked,
        };
        if (!body.title) return toast('Title is required', { type: 'error' });
        try {
          if (isNew) await api.createPrompt(body);
          else await api.updatePrompt(existing.id, body);
          closeModal();
          await ctx.refresh();
          toast(isNew ? 'Prompt created' : 'Prompt saved', { type: 'success' });
        } catch (e) { toast(e.message || 'Failed', { type: 'error' }); }
      } }, [isNew ? 'Create' : 'Save']),
    ]),
  });
}

function mkInput(value) { const i = document.createElement('input'); i.value = value || ''; return i; }
function mkTextarea(value, rows = 4) { const t = document.createElement('textarea'); t.value = value || ''; t.rows = rows; t.className = 'mono'; return t; }
function fieldWrap(node, label, opts = {}) {
  return el('div', {}, [
    el('div', { class: 'label-sm mb-1' }, [label, opts.required ? el('span', { style: { color: 'var(--red)' } }, [' *']) : null]),
    el('div', { class: node.tagName === 'TEXTAREA' ? 'field field-block' : 'field' }, [node]),
  ]);
}
