/**
 * friends.js
 * - Envio/aceite/recusa de pedidos de amizade por nome de usuário (handle).
 * - Abas: Todos / Disponível (online) / Pendente (recebidos + enviados) / Adicionar amigo.
 * - Presença "online" via heartbeat compartilhado (mesmo mecanismo usado nos servidores).
 * - Lista de conversas diretas (DMs) na home sidebar.
 *
 * Modelo de dados (chave compartilhada 'friend-links'):
 *   friend-links: { "<linkId>": { a, b, status } }
 *     status: 'pending' (a pediu, esperando b) | 'accepted'
 *   presence-global: { "<handle>": <timestamp last seen> }
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, sSet, esc, initials, timeLabel } = A.store;

  let presencePollTimer = null;
  let friendsPollTimer = null;
  let currentTab = 'todos';

  function $(sel){ return document.querySelector(sel); }

  function linkId(h1, h2){ return [h1, h2].sort().join('__'); }

  async function getLinks(){ return (await sGet('friend-links')) || {}; }
  async function saveLinks(links){ return sSet('friend-links', links); }

  async function sendFriendRequest(targetHandleRaw){
    const me = A.state.me.handle;
    const target = A.auth.normalizeHandle(targetHandleRaw);
    if(!target) return { ok:false, error:'Digite um nome de usuário.' };
    if(target === me) return { ok:false, error:'Você não pode adicionar a si mesmo.' };

    const dir = await A.auth.getUsersDirectory();
    if(!dir[target]) return { ok:false, error:'Não existe nenhum usuário com esse nome no Akiline.' };

    const links = await getLinks();
    const id = linkId(me, target);
    const existing = links[id];
    if(existing){
      if(existing.status === 'accepted') return { ok:false, error:'Vocês já são amigos.' };
      if(existing.status === 'pending') return { ok:false, error:'Já existe um pedido pendente entre vocês.' };
    }
    links[id] = { a: me, b: target, status: 'pending', requestedBy: me, ts: Date.now() };
    await saveLinks(links);
    return { ok:true };
  }

  async function respondToRequest(otherHandle, accept){
    const me = A.state.me.handle;
    const links = await getLinks();
    const id = linkId(me, otherHandle);
    if(!links[id]) return;
    if(accept){
      links[id].status = 'accepted';
      links[id].acceptedAt = Date.now();
    } else {
      delete links[id];
    }
    await saveLinks(links);
    renderAll();
  }

  async function cancelOutgoing(otherHandle){
    const me = A.state.me.handle;
    const links = await getLinks();
    const id = linkId(me, otherHandle);
    if(links[id] && links[id].status === 'pending') delete links[id];
    await saveLinks(links);
    renderAll();
  }

  async function getMyFriendHandles(){
    const me = A.state.me.handle;
    const links = await getLinks();
    return Object.values(links)
      .filter(l => l.status === 'accepted' && (l.a === me || l.b === me))
      .map(l => (l.a === me ? l.b : l.a));
  }

  async function getIncomingRequests(){
    const me = A.state.me.handle;
    const links = await getLinks();
    return Object.values(links).filter(l => l.status === 'pending' && l.requestedBy !== me && (l.a === me || l.b === me))
      .map(l => (l.a === me ? l.b : l.a));
  }
  async function getOutgoingRequests(){
    const me = A.state.me.handle;
    const links = await getLinks();
    return Object.values(links).filter(l => l.status === 'pending' && l.requestedBy === me && (l.a === me || l.b === me))
      .map(l => (l.a === me ? l.b : l.a));
  }

  /* ---------------- Presence ---------------- */
  async function pingPresence(){
    if(!A.state.me) return;
    const map = (await sGet('presence-global')) || {};
    map[A.state.me.handle] = Date.now();
    await sSet('presence-global', map);
  }
  function startPresenceLoop(){
    pingPresence();
    if(presencePollTimer) clearInterval(presencePollTimer);
    presencePollTimer = setInterval(pingPresence, 8000);
  }
  async function isOnline(handle){
    const map = (await sGet('presence-global')) || {};
    return !!(map[handle] && Date.now() - map[handle] < 25000);
  }
  async function getOnlineMap(){
    const map = (await sGet('presence-global')) || {};
    const now = Date.now();
    const out = {};
    Object.entries(map).forEach(([h, ts]) => { out[h] = (now - ts) < 25000; });
    return out;
  }

  /* ---------------- Rendering: tabs ---------------- */
  async function renderAll(){
    if(!A.state.me) return;
    const [friends, incoming, outgoing, onlineMap] = await Promise.all([
      getMyFriendHandles(), getIncomingRequests(), getOutgoingRequests(), getOnlineMap()
    ]);
    const badge = $('#pending-badge');
    if(incoming.length > 0){ badge.style.display = 'inline-block'; badge.textContent = incoming.length; }
    else badge.style.display = 'none';

    const content = $('#friends-content');
    if(!content) return;

    if(currentTab === 'todos'){
      content.innerHTML = friends.length ? friends.map(h => friendRowHtml(h, onlineMap[h], 'message')).join('')
        : `<div class="empty-friends">Você ainda não tem amigos adicionados.<br>Vai na aba "+ Adicionar amigo" pra chamar alguém!</div>`;
      bindMessageButtons(content);
    } else if(currentTab === 'online'){
      const onlineFriends = friends.filter(h => onlineMap[h]);
      content.innerHTML = onlineFriends.length ? onlineFriends.map(h => friendRowHtml(h, true, 'message')).join('')
        : `<div class="empty-friends">Nenhum amigo online agora.</div>`;
      bindMessageButtons(content);
    } else if(currentTab === 'pendente'){
      let html = '';
      if(incoming.length){
        html += `<div class="dm-list-label" style="padding-left:2px;">Pedidos recebidos</div>`;
        html += incoming.map(h => friendRowHtml(h, onlineMap[h], 'respond')).join('');
      }
      if(outgoing.length){
        html += `<div class="dm-list-label" style="padding-left:2px; margin-top:10px;">Pedidos enviados</div>`;
        html += outgoing.map(h => friendRowHtml(h, onlineMap[h], 'cancel')).join('');
      }
      content.innerHTML = html || `<div class="empty-friends">Nenhum pedido pendente.</div>`;
      bindRespondButtons(content);
      bindCancelButtons(content);
    } else if(currentTab === 'adicionar'){
      content.innerHTML = `
        <div class="add-friend-inline">
          <h3>Adicionar amigo</h3>
          <p>Digite o nome de usuário exato do seu amigo no Akiline.</p>
          <div class="inline-row">
            <input class="text-field" id="inline-add-friend-input" placeholder="nomedeusuario">
            <button class="primary-btn" id="inline-add-friend-btn" style="width:auto; padding:9px 18px;">Enviar</button>
          </div>
          <div class="form-error" id="inline-add-friend-error"></div>
        </div>
      `;
      $('#inline-add-friend-btn').addEventListener('click', async () => {
        const val = $('#inline-add-friend-input').value;
        const res = await sendFriendRequest(val);
        if(!res.ok){ $('#inline-add-friend-error').textContent = res.error; return; }
        $('#inline-add-friend-input').value = '';
        $('#inline-add-friend-error').textContent = '';
        currentTab = 'pendente';
        setActiveTab('pendente');
        renderAll();
      });
    }

    renderDmList(friends, onlineMap);
  }

  function friendRowHtml(handle, online, mode){
    const avatarColor = '#9C8F7C';
    let actions = '';
    if(mode === 'message'){
      actions = `<button class="fa-btn message" data-dm="${esc(handle)}">Mensagem</button>`;
    } else if(mode === 'respond'){
      actions = `<button class="fa-btn accept" data-accept="${esc(handle)}">Aceitar</button>
                 <button class="fa-btn decline" data-decline="${esc(handle)}">Recusar</button>`;
    } else if(mode === 'cancel'){
      actions = `<button class="fa-btn cancel" data-cancel="${esc(handle)}">Cancelar pedido</button>`;
    }
    return `
      <div class="friend-row">
        <div class="friend-avatar" style="background:${avatarColor}">
          ${esc(initials(handle))}
          <span class="status-dot ${online ? 'online' : 'offline'}"></span>
        </div>
        <div class="friend-info">
          <div class="friend-name">@${esc(handle)}</div>
          <div class="friend-sub">${online ? 'Disponível' : 'Offline'}</div>
        </div>
        <div class="friend-actions">${actions}</div>
      </div>
    `;
  }

  function bindMessageButtons(root){
    root.querySelectorAll('[data-dm]').forEach(btn => {
      btn.addEventListener('click', () => A.app.openDm(btn.dataset.dm));
    });
  }
  function bindRespondButtons(root){
    root.querySelectorAll('[data-accept]').forEach(btn => btn.addEventListener('click', () => respondToRequest(btn.dataset.accept, true)));
    root.querySelectorAll('[data-decline]').forEach(btn => btn.addEventListener('click', () => respondToRequest(btn.dataset.decline, false)));
  }
  function bindCancelButtons(root){
    root.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => cancelOutgoing(btn.dataset.cancel)));
  }

  function renderDmList(friends, onlineMap){
    const html = friends.length ? friends.map(h => `
      <button class="dm-row ${A.state.currentDmHandle===h ? 'active':''}" data-dm-row="${esc(h)}">
        <div class="dm-avatar" style="background:#9C8F7C">${esc(initials(h))}<span class="status-dot ${onlineMap[h]?'online':'offline'}"></span></div>
        <div class="dm-name">@${esc(h)}</div>
      </button>
    `).join('') : `<div class="dm-list-label">Adicione amigos para conversar</div>`;
    ['#dm-list', '#dm-list-2'].forEach(sel => {
      const el = $(sel);
      if(!el) return;
      el.innerHTML = `<div class="dm-list-label">Mensagens diretas</div>` + html;
      el.querySelectorAll('[data-dm-row]').forEach(btn => btn.addEventListener('click', () => A.app.openDm(btn.dataset.dmRow)));
    });
  }

  function setActiveTab(tab){
    currentTab = tab;
    document.querySelectorAll('.friends-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  }

  function startFriendsPoll(){
    if(friendsPollTimer) clearInterval(friendsPollTimer);
    friendsPollTimer = setInterval(() => { if(A.state.currentView === 'home') renderAll(); }, 6000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.friends-tab').forEach(tab => {
      tab.addEventListener('click', () => { setActiveTab(tab.dataset.tab); renderAll(); });
    });

    // Modal genérico de adicionar amigo (aberto a partir de outros pontos da UI se necessário)
    $('#close-add-friend-btn').addEventListener('click', () => $('#add-friend-overlay').classList.remove('open'));
    $('#confirm-add-friend-btn').addEventListener('click', async () => {
      const val = $('#add-friend-input').value;
      const res = await sendFriendRequest(val);
      if(!res.ok){ $('#add-friend-error').textContent = res.error; return; }
      $('#add-friend-input').value = '';
      $('#add-friend-error').textContent = '';
      $('#add-friend-overlay').classList.remove('open');
      renderAll();
    });
  });

  A.friends = {
    renderAll, setActiveTab, startPresenceLoop, startFriendsPoll,
    pingPresence, isOnline, getOnlineMap, getMyFriendHandles, sendFriendRequest
  };
})();
