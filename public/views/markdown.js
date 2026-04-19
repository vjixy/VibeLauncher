import { el, mount, timeAgo, formatBytes, renderMarkdownToHtml, copyToClipboard, downloadBlob } from '../utils.js';
import { state, getMarkdown } from '../state.js';
import { renderSidebar, renderHeader, panelBlock, iconRow, colorForIndex } from '../chrome.js';
import { openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export function renderMarkdown(ctx) {
  renderSidebar({ ...ctx, contextPanel: buildSidebar(ctx) });
  renderHeader({
    title: 'Markdown',
    subtitle: subtitle(),
    onPalette: ctx.onPalette,
    onSearch: (v) => { state.markdown.search = v; renderMarkdown(ctx); },
    searchValue: state.markdown.search,
    searchPlaceholder: 'Search by title, heading, tag, or full text…',
    actions: [
      el('button', { class: 'btn btn-secondary', onclick: () => ctx.emit('import-markdown') }, [el('i', { class: 'ph ph-upload-simple text-[13px]' }), 'Import']),
      el('button', { class: 'btn btn-primary', onclick: () => createBlankDoc(ctx) }, [el('i', { class: 'ph ph-plus text-[13px]' }), 'New doc']),
    ],
  });

  const content = document.getElementById('appContent');
  const files = filtered();

  if (state.markdownFiles.length === 0) {
    mount(content, el('section', { style: { padding: '24px' } }, [
      dropZone(ctx, true),
      el('div', { class: 'empty-state' }, [
        el('div', { class: 'ic', style: { background: 'var(--amber-soft)', color: 'var(--amber)' } }, [el('i', { class: 'ph ph-file-text' })]),
        el('h3', {}, ['Drop markdown files here']),
        el('p', {}, ['Specs, notes, cheat sheets — all in one tidy library. Drag .md files or click Import.']),
      ]),
    ]));
    return;
  }

  mount(content, el('section', { style: { padding: '24px' } }, [
    dropZone(ctx, false),
    el('div', { class: 'flex items-center gap-2 mb-4 text-[12.5px]', style: { color: 'var(--text-1)' } }, [
      el('span', { style: { color: 'var(--text-2)' } }, ['All docs']),
      el('i', { class: 'ph ph-caret-right text-[10px]', style: { color: 'var(--text-3)' } }),
      el('span', {}, [`${files.length} items`]),
      state.markdown.selection.size > 0 ? bulkActions(ctx) : null,
      el('div', { class: 'ml-auto flex items-center gap-1.5' }, [
        el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, ['Sort by']),
        el('div', { class: 'field', style: { height: '28px' } }, [
          el('select', {}, [el('option', {}, ['Last edited']), el('option', {}, ['Name']), el('option', {}, ['Size'])]),
        ]),
      ]),
    ]),
    el('div', { class: 'list-head', style: { gridTemplateColumns: '30px 1fr 180px 120px 90px 28px' } }, [
      el('div', {}),
      el('div', {}, ['Title']),
      el('div', {}, ['Tags']),
      el('div', {}, ['Edited']),
      el('div', { style: { textAlign: 'right' } }, ['Size']),
      el('div', {}),
    ]),
    el('div', { class: 'flex flex-col gap-0.5' }, files.map(f => mdRow(f, ctx))),
  ]));
}

function subtitle() {
  const n = state.markdownFiles.length;
  const lastEdit = state.markdownFiles[0]?.updatedAt;
  return `${n} docs${lastEdit ? ` · last edit ${timeAgo(lastEdit)}` : ''}`;
}

function buildSidebar(ctx) {
  const tagCounts = new Map();
  state.markdownFiles.forEach(f => (f.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));

  return el('div', { class: 'flex flex-col gap-4 flex-1 min-h-0' }, [
    panelBlock('Collections', null, [
      iconRow({ icon: 'ph-books', label: 'All docs', count: state.markdownFiles.length, active: state.markdown.filter === 'all', onclick: () => { state.markdown.filter = 'all'; state.markdown.tag = null; renderMarkdown(ctx); } }),
      iconRow({ icon: 'ph-clock-counter-clockwise', label: 'Recently edited', count: state.markdownFiles.slice(0, 10).length, active: state.markdown.filter === 'recent', onclick: () => { state.markdown.filter = 'recent'; renderMarkdown(ctx); } }),
    ]),
    panelBlock('Tags', null, [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count], i) =>
      el('button', { class: `ws-row ${state.markdown.tag === tag ? 'active' : ''}`, style: { width: '100%', border: 0, textAlign: 'left' }, onclick: () => { state.markdown.tag = state.markdown.tag === tag ? null : tag; renderMarkdown(ctx); } }, [
        el('span', { class: 'ws-bar', style: { background: colorForIndex(i) } }),
        el('span', { class: 'truncate-1' }, [tag]),
        el('span', { class: 'count' }, [String(count)]),
      ])
    )),
  ]);
}

function filtered() {
  let out = [...state.markdownFiles];
  const q = state.markdown.search.trim().toLowerCase();
  if (q) out = out.filter(f => f.title.toLowerCase().includes(q) || f.filename.toLowerCase().includes(q) || (f.excerpt || '').toLowerCase().includes(q) || (f.tags || []).some(t => t.toLowerCase().includes(q)));
  if (state.markdown.tag) out = out.filter(f => (f.tags || []).includes(state.markdown.tag));
  if (state.markdown.filter === 'recent') out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return out;
}

function dropZone(ctx, large) {
  const zone = el('div', {
    class: 'md-dropzone',
    style: large ? { padding: '40px' } : { padding: '12px', marginBottom: '16px' },
    ondragover: (e) => { e.preventDefault(); zone.classList.add('active'); },
    ondragleave: () => zone.classList.remove('active'),
    ondrop: async (e) => {
      e.preventDefault();
      zone.classList.remove('active');
      const files = await readFilesAsText([...(e.dataTransfer.files || [])]);
      if (files.length) { await api.importMarkdown({ files }); await ctx.refresh(); toast(`Imported ${files.length} file${files.length > 1 ? 's' : ''}`, { type: 'success' }); }
    },
  }, [
    el('i', { class: 'ph ph-file-arrow-down text-[18px] mr-2' }),
    large ? 'Drop .md files anywhere on this screen to import them' : 'Drop .md files here to import',
  ]);
  return zone;
}

async function readFilesAsText(fileList) {
  const out = [];
  for (const file of fileList) {
    if (!file.name.match(/\.md$/i)) continue;
    const text = await file.text();
    out.push({ name: file.name, content: text });
  }
  return out;
}

function mdRow(f, ctx) {
  const selected = state.markdown.selection.has(f.id);
  return el('div', { class: `md-row ${state.markdown.selectedId === f.id ? 'active' : ''}`, onclick: () => openMarkdownDetail(f.id, ctx) }, [
    el('input', { type: 'checkbox', checked: selected, onclick: (e) => { e.stopPropagation(); if (e.target.checked) state.markdown.selection.add(f.id); else state.markdown.selection.delete(f.id); renderMarkdown(ctx); } }),
    el('div', { class: 'min-w-0' }, [
      el('div', { class: 'text-[13.5px] font-semibold truncate-1' }, [f.title]),
      el('div', { class: 'text-[11.5px] truncate-1', style: { color: 'var(--text-2)' } }, [f.excerpt || f.filename]),
    ]),
    el('div', { class: 'flex items-center gap-1 flex-wrap' }, (f.tags || []).slice(0, 3).map(t => el('span', { class: 'tag' }, [t]))),
    el('div', { class: 'text-[12px]', style: { color: 'var(--text-1)' } }, [timeAgo(f.updatedAt)]),
    el('div', { class: 'text-[12px] mono', style: { textAlign: 'right', color: 'var(--text-2)' } }, [formatBytes(f.size)]),
    el('button', { class: 'btn btn-ghost btn-icon', style: { height: '24px', width: '24px' }, onclick: (e) => { e.stopPropagation(); openMarkdownDetail(f.id, ctx); } }, [el('i', { class: 'ph ph-dots-three-vertical text-[12px]' })]),
  ]);
}

function bulkActions(ctx) {
  return el('div', { class: 'flex items-center gap-2 ml-4' }, [
    el('span', { class: 'pill pill-accent' }, [`${state.markdown.selection.size} selected`]),
    el('button', { class: 'btn btn-sm btn-secondary', onclick: async () => {
      const ids = [...state.markdown.selection];
      const res = await fetch('/api/markdown-files/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      const blob = await res.blob();
      downloadBlob(blob, `markdown-library-${Date.now()}.zip`);
      toast('Exported');
    } }, [el('i', { class: 'ph ph-download-simple text-[12px]' }), 'Export ZIP']),
    el('button', { class: 'btn btn-sm btn-destructive', onclick: async () => {
      const ok = await confirmDialog({ title: 'Delete files?', message: `${state.markdown.selection.size} file(s) will be removed from the library.`, confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      for (const id of state.markdown.selection) await api.deleteMarkdown(id);
      state.markdown.selection.clear();
      await ctx.refresh();
      toast('Deleted');
    } }, ['Delete']),
    el('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.markdown.selection.clear(); renderMarkdown(ctx); } }, ['Clear']),
  ]);
}

async function openMarkdownDetail(id, ctx) {
  state.markdown.selectedId = id;
  let full;
  try { full = await api.getMarkdown(id); } catch { return toast('Failed to load file', { type: 'error' }); }

  let activeTab = 'preview';
  const titleInput = mkInput(full.title);
  const tagsInput = mkInput((full.tags || []).join(', '));
  const descInput = mkInput(full.description || '');
  const contentTa = document.createElement('textarea');
  contentTa.className = 'mono';
  contentTa.rows = 18;
  contentTa.value = full.content || '';
  contentTa.style.cssText = 'width:100%;min-height:360px;background:var(--bg-2);border:1px solid var(--line-1);border-radius:8px;padding:12px;color:var(--text-0);font-size:12.5px;resize:vertical;';

  const previewContainer = el('div', { class: 'md-preview' });
  function updatePreview() { previewContainer.innerHTML = renderMarkdownToHtml(contentTa.value); }
  contentTa.oninput = updatePreview;
  updatePreview();

  function body() {
    const tabs = ['preview', 'source', 'metadata'];
    const tabsRow = el('div', { class: 'tabs-row', style: { padding: 0, margin: '-20px -20px 0' } }, tabs.map(t =>
      el('div', { class: `tab ${activeTab === t ? 'active' : ''}`, style: { marginLeft: '20px' }, onclick: () => { activeTab = t; renderBody(); } }, [t[0].toUpperCase() + t.slice(1)])
    ));
    const container = el('div', { class: 'flex flex-col' });
    function renderBody() {
      container.innerHTML = '';
      container.appendChild(tabsRow);
      tabsRow.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.textContent.toLowerCase() === activeTab));
      const panel = el('div', { style: { padding: '20px' } });
      if (activeTab === 'preview') panel.appendChild(previewContainer);
      else if (activeTab === 'source') panel.appendChild(contentTa);
      else {
        panel.appendChild(el('div', { class: 'flex flex-col gap-3' }, [
          fieldWrap(titleInput, 'Title'),
          fieldWrap(mkInput(full.filename, true), 'Filename'),
          fieldWrap(tagsInput, 'Tags (comma-separated)'),
          fieldWrap(descInput, 'Description'),
          el('div', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, [`Size: ${formatBytes(full.size)} · Created: ${new Date(full.createdAt).toLocaleString()}`]),
        ]));
      }
      container.appendChild(panel);
    }
    renderBody();
    return container;
  }

  openModal({
    title: full.title,
    subtitle: full.filename,
    icon: 'ph ph-file-text',
    wide: true,
    body: body(),
    footer: el('div', { class: 'flex items-center gap-2' }, [
      el('button', { class: 'btn btn-ghost', onclick: async () => { await copyToClipboard(contentTa.value); toast('Copied raw markdown'); } }, [el('i', { class: 'ph ph-copy' }), 'Copy raw']),
      el('button', { class: 'btn btn-ghost', onclick: () => downloadBlob(new Blob([contentTa.value], { type: 'text/markdown' }), full.filename) }, [el('i', { class: 'ph ph-download-simple' }), 'Download']),
      el('button', { class: 'btn btn-destructive', onclick: async () => { const ok = await confirmDialog({ title: 'Delete file?', message: `"${full.filename}" will be removed.`, confirmLabel: 'Delete', danger: true }); if (!ok) return; await api.deleteMarkdown(id); closeModal(); await ctx.refresh(); toast('Deleted'); } }, ['Delete']),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        await api.updateMarkdown(id, {
          title: titleInput.value.trim(),
          tags: tagsInput.value.split(',').map(s => s.trim()).filter(Boolean),
          description: descInput.value,
          content: contentTa.value,
        });
        closeModal();
        await ctx.refresh();
        toast('Saved');
      } }, ['Save']),
    ]),
  });
}

async function createBlankDoc(ctx) {
  const name = prompt('Filename (e.g. notes.md)');
  if (!name) return;
  const title = name.replace(/\.md$/i, '').trim() || 'Untitled';
  await api.importMarkdown({ files: [{ name: name.match(/\.md$/i) ? name : `${name}.md`, content: `# ${title}\n\n` }] });
  await ctx.refresh();
  toast('Created');
}

function mkInput(value, mono = false) { const i = document.createElement('input'); i.value = value || ''; if (mono) i.classList.add('mono'); return i; }
function fieldWrap(node, label) {
  return el('div', {}, [
    el('div', { class: 'label-sm mb-1' }, [label]),
    el('div', { class: node.tagName === 'TEXTAREA' ? 'field field-block' : 'field' }, [node]),
  ]);
}

/* Global markdown import action — called from any screen via ctx */
export async function triggerMarkdownImport(ctx) {
  const input = document.getElementById('fileUploadInput');
  input.value = '';
  input.onchange = async () => {
    const files = await readFilesAsText([...input.files]);
    if (!files.length) return;
    await api.importMarkdown({ files });
    await ctx.refresh();
    toast(`Imported ${files.length} file${files.length > 1 ? 's' : ''}`, { type: 'success' });
    if (state.section !== 'markdown') ctx.navigate('markdown');
  };
  input.click();
}
