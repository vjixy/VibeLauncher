import { el } from '../utils.js';
import { state } from '../state.js';
import { openModal, closeModal, toast } from '../ui.js';
import { api } from '../api.js';

export function openProjectModal(existing, onSave) {
  const project = existing || { name: '', path: '', logo: '', ide: state.settings.defaultIde || 'code', categories: [], commands: [], notes: '', pinned: false };
  const isNew = !existing;

  const nameInput = input(project.name);
  const pathInput = input(project.path, { mono: true });
  const logoInput = input(project.logo);
  const ideInput = input(project.ide || 'code');
  const notesInput = textarea(project.notes, 3);

  const categoriesSet = new Set(project.categories || []);
  const extraCategoriesInput = input('');

  let commands = (project.commands || []).map(c => ({ ...c }));
  if (commands.length === 0) commands.push({ name: '', cmd: '' });

  const commandsContainer = el('div', { class: 'flex flex-col gap-2' });
  function renderCommands() {
    commandsContainer.innerHTML = '';
    commands.forEach((c, i) => {
      const nameField = input(c.name);
      const cmdField = input(c.cmd, { mono: true });
      nameField.addEventListener('input', () => { commands[i].name = nameField.value; });
      cmdField.addEventListener('input', () => { commands[i].cmd = cmdField.value; });
      commandsContainer.appendChild(el('div', { class: 'grid gap-2', style: { gridTemplateColumns: '140px 1fr 32px' } }, [
        fieldWrap(nameField, 'Name'),
        fieldWrap(cmdField, 'Command'),
        el('button', { class: 'btn btn-ghost btn-icon', style: { marginTop: '20px' }, onclick: () => { commands.splice(i, 1); if (commands.length === 0) commands.push({ name: '', cmd: '' }); renderCommands(); } }, [el('i', { class: 'ph ph-x text-[12px]' })]),
      ]));
    });
    commandsContainer.appendChild(el('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start' }, onclick: () => { commands.push({ name: '', cmd: '' }); renderCommands(); } }, [
      el('i', { class: 'ph ph-plus text-[11px]' }), 'Add command',
    ]));
  }
  renderCommands();

  const categoryChecks = el('div', { class: 'flex flex-wrap gap-1.5' });
  function renderCategories() {
    categoryChecks.innerHTML = '';
    state.categories.forEach(cat => {
      const active = categoriesSet.has(cat);
      categoryChecks.appendChild(el('button', {
        class: `pill ${active ? 'pill-accent' : ''}`,
        onclick: (e) => { e.preventDefault(); if (active) categoriesSet.delete(cat); else categoriesSet.add(cat); renderCategories(); },
      }, [cat]));
    });
    if (state.categories.length === 0) {
      categoryChecks.appendChild(el('span', { class: 'text-[11.5px]', style: { color: 'var(--text-2)' } }, ['No categories yet — add extras below.']));
    }
  }
  renderCategories();

  openModal({
    title: isNew ? 'New project' : 'Edit project',
    subtitle: isNew ? 'Add a folder and wire up commands' : 'Update the project details',
    icon: 'ph-fill ph-folder',
    wide: true,
    body: el('form', { onsubmit: (e) => e.preventDefault() }, [
      el('div', { class: 'grid grid-cols-2 gap-6' }, [
        el('div', { class: 'flex flex-col gap-3' }, [
          fieldWrap(nameInput, 'Name', { required: true }),
          fieldWrap(pathInput, 'Absolute path', { required: true }),
          el('div', { class: 'grid grid-cols-2 gap-3' }, [
            fieldWrap(ideInput, 'IDE command'),
            fieldWrap(logoInput, 'Logo URL (optional)'),
          ]),
          fieldWrap(notesInput, 'Notes'),
          el('label', { class: 'flex items-center gap-2 mt-1 text-[12.5px]' }, [
            el('input', { type: 'checkbox', checked: !!project.pinned, id: 'pinChk' }),
            el('span', {}, ['Pin to top']),
          ]),
        ]),
        el('div', { class: 'flex flex-col gap-3' }, [
          el('div', {}, [
            el('div', { class: 'label-sm mb-2' }, ['Categories']),
            categoryChecks,
            el('div', { class: 'mt-2 flex items-center gap-2' }, [
              fieldWrap(extraCategoriesInput, 'Add more (comma-separated)'),
            ]),
          ]),
          el('div', {}, [
            el('div', { class: 'label-sm mb-2' }, ['Run commands']),
            commandsContainer,
          ]),
        ]),
      ]),
    ]),
    footer: el('div', { class: 'flex items-center gap-2' }, [
      el('span', { class: 'text-[11px] mr-auto', style: { color: 'var(--text-2)' } }, [isNew ? 'Saved locally · no cloud' : `id: ${(existing?.id || '').slice(-8)}`]),
      el('button', { class: 'btn btn-ghost', onclick: closeModal }, ['Cancel']),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        const pinned = document.getElementById('pinChk').checked;
        const extra = extraCategoriesInput.value.split(',').map(s => s.trim()).filter(Boolean);
        const categories = [...new Set([...categoriesSet, ...extra])];
        const body = {
          name: nameInput.value.trim(),
          path: pathInput.value.trim(),
          logo: logoInput.value.trim(),
          ide: ideInput.value.trim() || 'code',
          notes: notesInput.value.trim(),
          pinned,
          categories,
          commands: commands.filter(c => c.name && c.cmd),
        };
        if (!body.name) return toast('Name is required', { type: 'error' });
        if (!body.path) return toast('Path is required', { type: 'error' });
        try {
          if (isNew) await api.createProject(body);
          else await api.updateProject(existing.id, body);
          closeModal();
          await onSave?.();
          toast(isNew ? 'Project created' : 'Project updated', { type: 'success' });
        } catch (e) { toast(e.message || 'Failed to save', { type: 'error' }); }
      } }, [isNew ? 'Create project' : 'Save changes']),
    ]),
  });
}

function input(value, opts = {}) {
  const node = document.createElement('input');
  node.value = value || '';
  if (opts.mono) node.classList.add('mono');
  return node;
}
function textarea(value, rows = 3) {
  const node = document.createElement('textarea');
  node.value = value || '';
  node.rows = rows;
  return node;
}
function fieldWrap(node, label, opts = {}) {
  const wrapper = el('div', {}, [
    el('div', { class: 'label-sm mb-1', style: { padding: 0 } }, [label, opts.required ? el('span', { style: { color: 'var(--red)' } }, [' *']) : null]),
    el('div', { class: node.tagName === 'TEXTAREA' ? 'field field-block' : 'field' }, [node]),
  ]);
  return wrapper;
}
