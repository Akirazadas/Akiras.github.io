/**
 * servers.js
 * - Rail lateral com os servidores do usuário + botão "+".
 * - Modal de "Adicionar servidor": criar do zero OU entrar com código de convite.
 * - Modal de configurações do servidor: visão geral, categorias, canais, cargos, convite.
 *
 * Modelo de dados (chave compartilhada por servidor, 'server:<id>'):
 *   { id, name, ownerHandle, inviteCode, categories:[...], roles:[...] }
 * Índice de convites (compartilhado, 'invite-index'): { "<CODE>": serverId }
 * Lista de servidores do usuário (local a este dispositivo, 'my-server-ids'): [ids]
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, sSet, pGet, pSet, esc, uid, genInviteCode } = A.store;

  function $(sel){ return document.querySelector(sel); }

  async function loadServer(id){
    const data = await sGet('server:' + id);
    if(data) A.state.servers[id] = data;
    return data;
  }
  async function saveServer(server){
    A.state.servers[server.id] = server;
    return sSet('server:' + server.id, server);
  }

  async function loadMyServerIds(){
    const raw = await pGet('my-server-ids');
    A.state.myServerIds = raw ? JSON.parse(raw) : [];
    return A.state.myServerIds;
  }
  async function saveMyServerIds(){
    return pSet('my-server-ids', JSON.stringify(A.state.myServerIds));
  }

  async function createServer(name){
    const struct = A.defaultServerStructure(name);
    const id = uid('srv');
    const inviteCode = genInviteCode();
    const server = { id, name: struct.name, ownerHandle: A.state.me.handle, inviteCode, categories: struct.categories, roles: struct.roles };
    await saveServer(server);
    const inviteIndex = (await sGet('invite-index')) || {};
    inviteIndex[inviteCode] = id;
    await sSet('invite-index', inviteIndex);
    A.state.myServerIds.push(id);
    await saveMyServerIds();
    return server;
  }

  async function joinServerByCode(codeRaw){
    const code = (codeRaw || '').trim().toUpperCase();
    if(!code) return { ok:false, error:'Digite um código.' };
    const inviteIndex = (await sGet('invite-index')) || {};
    const serverId = inviteIndex[code];
    if(!serverId) return { ok:false, error:'Nenhum servidor encontrado com esse código.' };
    const server = await loadServer(serverId);
    if(!server) return { ok:false, error:'Esse servidor não existe mais.' };
    if(!A.state.myServerIds.includes(serverId)){
      A.state.myServerIds.push(serverId);
      await saveMyServerIds();
    }
    return { ok:true, server };
  }

  async function renderServerRail(){
    await loadMyServerIds();
    await Promise.all(A.state.myServerIds.map(id => loadServer(id)));
    const rail = $('#rail-servers');
    rail.innerHTML = A.state.myServerIds.map(id => {
      const s = A.state.servers[id];
      if(!s) return '';
      const isActive = A.state.currentView === 'server' && A.state.currentServerId === id;
      return `<button class="rail-item server-item ${isActive?'active':''}" data-server-id="${id}" title="${esc(s.name)}">${esc((s.name||'?').trim().slice(0,2).toUpperCase())}</button>`;
    }).join('');
    rail.querySelectorAll('[data-server-id]').forEach(btn => {
      btn.addEventListener('click', () => A.app.openServer(btn.dataset.serverId));
    });
  }
  A.servers_renderRail = renderServerRail;

  /* ---------------- Server picker modal ---------------- */
  function openServerPicker(){
    $('#picker-create-form').style.display = 'none';
    $('#picker-join-form').style.display = 'none';
    $('#new-server-name').value = '';
    $('#join-server-code').value = '';
    $('#join-server-error').textContent = '';
    $('#server-picker-overlay').classList.add('open');
  }

  /* ---------------- Settings modal ---------------- */
  function openSettings(){
    const s = A.state.servers[A.state.currentServerId];
    if(!s) return;
    $('#settings-server-name').value = s.name;
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'geral'));
    document.querySelectorAll('.settings-pane').forEach(p => p.style.display = p.dataset.pane === 'geral' ? 'block' : 'none');
    renderCategoriesSettings();
    renderChannelsSettings();
    renderRolesSettings();
    $('#invite-code-box').textContent = s.inviteCode;
    $('#settings-overlay').classList.add('open');
  }

  function currentServer(){ return A.state.servers[A.state.currentServerId]; }

  function renderCategoriesSettings(){
    const s = currentServer(); if(!s) return;
    const wrap = $('#categories-list');
    wrap.innerHTML = s.categories.map(cat => `
      <div class="list-row">
        <div class="lr-main">${esc(cat.name)}</div>
        <div class="lr-sub">${cat.channels.length} canal(is)</div>
        <button class="lr-del" data-delcat="${cat.id}">✕</button>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-delcat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        s.categories = s.categories.filter(c => c.id !== btn.dataset.delcat);
        await saveServer(s);
        renderCategoriesSettings(); renderChannelsSettings(); A.channels.renderSidebar();
      });
    });
  }

  function renderChannelsSettings(){
    const s = currentServer(); if(!s) return;
    const wrap = $('#channels-list');
    let html = '';
    s.categories.forEach(cat => {
      cat.channels.forEach(ch => {
        html += `
        <div class="list-row">
          <div class="lr-main">${ch.type==='voice'?'🔊':'#'} ${esc(ch.name)}</div>
          <div class="lr-sub">${esc(cat.name)}</div>
          <button class="lr-del" data-delch="${ch.id}" data-cat="${cat.id}">✕</button>
        </div>`;
      });
    });
    wrap.innerHTML = html || '<div style="color:var(--text-faint); font-size:12.5px;">Nenhum canal ainda.</div>';
    wrap.querySelectorAll('[data-delch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cat = s.categories.find(c => c.id === btn.dataset.cat);
        if(cat) cat.channels = cat.channels.filter(c => c.id !== btn.dataset.delch);
        await saveServer(s);
        renderChannelsSettings(); A.channels.renderSidebar();
      });
    });
    const catSelect = $('#new-channel-category');
    catSelect.innerHTML = s.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  function renderRolesSettings(){
    const s = currentServer(); if(!s) return;
    const wrap = $('#roles-list');
    wrap.innerHTML = s.roles.map(r => `
      <div class="list-row">
        <span class="role-dot" style="background:${r.color}"></span>
        <div class="lr-main">${esc(r.name)}</div>
        <button class="lr-del" data-delrole="${r.id}">✕</button>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-delrole]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(s.roles.length <= 1) return;
        s.roles = s.roles.filter(r => r.id !== btn.dataset.delrole);
        await saveServer(s);
        renderRolesSettings();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#rail-add-server').addEventListener('click', openServerPicker);
    $('#close-server-picker-btn').addEventListener('click', () => $('#server-picker-overlay').classList.remove('open'));

    $('#picker-create-btn').addEventListener('click', () => {
      $('#picker-create-form').style.display = 'block';
      $('#picker-join-form').style.display = 'none';
    });
    $('#picker-join-btn').addEventListener('click', () => {
      $('#picker-join-form').style.display = 'block';
      $('#picker-create-form').style.display = 'none';
    });

    $('#confirm-create-server-btn').addEventListener('click', async () => {
      const name = $('#new-server-name').value.trim();
      if(!name) return;
      const server = await createServer(name);
      $('#server-picker-overlay').classList.remove('open');
      await renderServerRail();
      A.app.openServer(server.id);
    });

    $('#confirm-join-server-btn').addEventListener('click', async () => {
      const code = $('#join-server-code').value;
      const res = await joinServerByCode(code);
      if(!res.ok){ $('#join-server-error').textContent = res.error; return; }
      $('#server-picker-overlay').classList.remove('open');
      await renderServerRail();
      A.app.openServer(res.server.id);
    });

    $('#open-settings-btn').addEventListener('click', openSettings);
    $('#close-settings-btn').addEventListener('click', () => $('#settings-overlay').classList.remove('open'));

    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.settings-pane').forEach(p => p.style.display = (p.dataset.pane === tab.dataset.tab) ? 'block' : 'none');
      });
    });

    $('#save-server-name-btn').addEventListener('click', async () => {
      const s = currentServer(); if(!s) return;
      const val = $('#settings-server-name').value.trim();
      if(!val) return;
      s.name = val.slice(0, 40);
      await saveServer(s);
      $('#server-name-label').textContent = s.name;
      await renderServerRail();
    });

    $('#add-category-btn').addEventListener('click', async () => {
      const s = currentServer(); if(!s) return;
      const input = $('#new-category-name');
      const name = input.value.trim();
      if(!name) return;
      s.categories.push({ id: uid('cat'), name: name.toUpperCase().slice(0,24), channels: [] });
      await saveServer(s);
      input.value = '';
      renderCategoriesSettings(); renderChannelsSettings(); A.channels.renderSidebar();
    });

    $('#add-channel-btn').addEventListener('click', async () => {
      const s = currentServer(); if(!s) return;
      const nameInput = $('#new-channel-name');
      let name = nameInput.value.trim();
      if(!name) return;
      const type = $('#new-channel-type').value;
      const catId = $('#new-channel-category').value;
      const cat = s.categories.find(c => c.id === catId);
      if(!cat) return;
      name = type === 'text' ? name.toLowerCase().replace(/\s+/g,'-').slice(0,24) : name.slice(0,24);
      cat.channels.push({ id: uid('ch'), name, type });
      await saveServer(s);
      nameInput.value = '';
      renderChannelsSettings(); A.channels.renderSidebar();
    });

    $('#add-role-btn').addEventListener('click', async () => {
      const s = currentServer(); if(!s) return;
      const nameInput = $('#new-role-name');
      const name = nameInput.value.trim();
      if(!name) return;
      const color = $('#new-role-color').value;
      s.roles.push({ id: uid('role'), name: name.slice(0,18), color });
      await saveServer(s);
      nameInput.value = '';
      renderRolesSettings();
    });

    $('#copy-invite-btn').addEventListener('click', async () => {
      const s = currentServer(); if(!s) return;
      try{ await navigator.clipboard.writeText(s.inviteCode); }catch(e){}
      const btn = $('#copy-invite-btn');
      const original = btn.textContent;
      btn.textContent = '✅ Copiado!';
      setTimeout(() => btn.textContent = original, 1500);
    });
  });

  A.serversApi = { loadServer, saveServer, loadMyServerIds, createServer, joinServerByCode, renderServerRail };
})();
