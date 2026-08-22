/**
 * chat.js
 * Mensagens de texto — tanto para canais de servidor quanto para DMs 1:1.
 * Usa polling simples sobre o storage compartilhado (sem servidor de
 * websockets real disponível neste ambiente).
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, sSet, esc, initials, timeLabel } = A.store;

  let pollTimer = null;
  let dmPollTimer = null;
  let presenceMembersTimer = null;
  let lastRenderedCount = {};

  function $(sel){ return document.querySelector(sel); }

  /* ===================== Server channel chat ===================== */
  async function openServerChannel(serverId, channelId, forceLoading){
    const key = 'messages:' + serverId + ':' + channelId;
    if(forceLoading) $('#messages').innerHTML = '<div id="loading-msgs">carregando conversa…</div>';
    const list = (await sGet(key)) || [];
    renderServerMessages(channelId, list);
    startPoll(serverId, channelId);
    startMembersPresence(serverId);
  }
  A.chat = { openServerChannel };

  function renderServerMessages(channelId, list){
    if(!A.state.currentChannel || A.state.currentChannel.id !== channelId || A.state.currentChannel.type !== 'text') return;
    const box = $('#messages');
    if(!list || list.length === 0){
      box.innerHTML = `<div class="empty-state"><div class="big">Ninguém falou nada ainda</div>seja o primeiro a puxar assunto em #${esc(A.state.currentChannel.name)}</div>`;
      lastRenderedCount[channelId] = 0;
      return;
    }
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    const server = A.state.servers[A.state.currentServerId];
    box.innerHTML = list.map(m => {
      const role = (server.roles.find(r => r.id === (m.roleId || 'membro'))) || server.roles[0];
      return `
      <div class="msg-row">
        <div class="msg-avatar" style="background:${m.avatarColor||'#9C8F7C'}">${esc(initials(m.author))}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${esc(m.author)}</span>
            <span class="msg-role-badge" style="color:${role.color}; background:${role.color}22;">${esc(role.name)}</span>
            <span class="msg-time">${esc(timeLabel(m.ts))}</span>
          </div>
          <div class="msg-text">${esc(m.text)}</div>
        </div>
      </div>`;
    }).join('');
    const grew = list.length > (lastRenderedCount[channelId] || 0);
    lastRenderedCount[channelId] = list.length;
    if(atBottom || grew) box.scrollTop = box.scrollHeight;
  }

  async function sendServerMessage(){
    const text = $('#msg-input').value.trim();
    const ch = A.state.currentChannel;
    if(!text || !ch || ch.type !== 'text') return;
    $('#send-btn').disabled = true;
    const key = 'messages:' + A.state.currentServerId + ':' + ch.id;
    const list = (await sGet(key)) || [];
    list.push({ author: A.state.me.nickname, text, ts: Date.now(), roleId: A.state.me.roleId || 'membro', avatarColor: A.state.me.avatarColor });
    const trimmed = list.slice(-300);
    await sSet(key, trimmed);
    $('#msg-input').value = '';
    renderServerMessages(ch.id, trimmed);
    $('#send-btn').disabled = false;
    $('#msg-input').focus();
  }

  function startPoll(serverId, channelId){
    if(pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if(!A.state.currentChannel || A.state.currentChannel.id !== channelId) return;
      const list = (await sGet('messages:' + serverId + ':' + channelId)) || [];
      renderServerMessages(channelId, list);
    }, 4000);
  }
  A.chat.stopPoll = () => { if(pollTimer) clearInterval(pollTimer); };

  /* ---------------- Members sidebar (server) ---------------- */
  async function startMembersPresence(serverId){
    await pingMemberPresence(serverId);
    if(presenceMembersTimer) clearInterval(presenceMembersTimer);
    presenceMembersTimer = setInterval(() => pingMemberPresence(serverId), 8000);
  }
  async function pingMemberPresence(serverId){
    if(!A.state.me || A.state.currentServerId !== serverId) return;
    const key = 'server-presence:' + serverId;
    const map = (await sGet(key)) || {};
    map[A.state.me.nickname] = { ts: Date.now(), avatarColor: A.state.me.avatarColor, roleId: A.state.me.roleId || 'membro' };
    await sSet(key, map);
    renderMembers(map);
  }
  function renderMembers(map){
    const now = Date.now();
    const server = A.state.servers[A.state.currentServerId];
    if(!server) return;
    const entries = Object.entries(map||{}).filter(([,v]) => now - v.ts < 25000).sort((a,b)=>a[0].localeCompare(b[0]));
    const list = $('#members-list');
    if(!list) return;
    if(entries.length === 0){ list.innerHTML = '<div style="color:var(--text-faint); font-size:12.5px; padding:6px;">ninguém por perto</div>'; return; }
    list.innerHTML = entries.map(([name, v]) => {
      const role = (server.roles.find(r => r.id === (v.roleId||'membro'))) || server.roles[0];
      return `
      <div class="member-row">
        <div class="member-avatar" style="background:${v.avatarColor||'#9C8F7C'}">${esc(initials(name))}<span class="status-dot online"></span></div>
        <div style="min-width:0;">
          <div class="member-name">${esc(name)}${name===A.state.me.nickname?' (você)':''}</div>
          <div class="member-role" style="color:${role.color}">${esc(role.name)}</div>
        </div>
      </div>`;
    }).join('');
  }

  /* ===================== Direct messages ===================== */
  function dmKey(h1, h2){ return 'dm:' + [h1, h2].sort().join('__'); }

  async function openDmChat(otherHandle){
    A.chat.stopPoll();
    const key = dmKey(A.state.me.handle, otherHandle);
    $('#dm-header-name').textContent = '@' + otherHandle;
    $('#dm-messages').innerHTML = '<div id="loading-msgs">carregando conversa…</div>';
    const list = (await sGet(key)) || [];
    renderDmMessages(otherHandle, list);
    startDmPoll(otherHandle);
  }
  A.chat.openDmChat = openDmChat;

  function renderDmMessages(otherHandle, list){
    if(A.state.currentDmHandle !== otherHandle) return;
    const box = $('#dm-messages');
    if(!list || list.length === 0){
      box.innerHTML = `<div class="empty-state"><div class="big">Nenhuma mensagem ainda</div>manda um "oi" pra @${esc(otherHandle)}!</div>`;
      return;
    }
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    box.innerHTML = list.map(m => `
      <div class="msg-row">
        <div class="msg-avatar" style="background:${m.avatarColor||'#9C8F7C'}">${esc(initials(m.author))}</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-author">${esc(m.author)}</span>
            <span class="msg-time">${esc(timeLabel(m.ts))}</span>
          </div>
          <div class="msg-text">${esc(m.text)}</div>
        </div>
      </div>`).join('');
    box.scrollTop = box.scrollHeight;
    if(atBottom){} // (mantido simples: DMs sempre rolam pro fim ao atualizar)
  }

  async function sendDmMessage(){
    const otherHandle = A.state.currentDmHandle;
    const text = $('#dm-msg-input').value.trim();
    if(!text || !otherHandle) return;
    const key = dmKey(A.state.me.handle, otherHandle);
    const list = (await sGet(key)) || [];
    list.push({ author: A.state.me.nickname, text, ts: Date.now(), avatarColor: A.state.me.avatarColor });
    const trimmed = list.slice(-300);
    await sSet(key, trimmed);
    $('#dm-msg-input').value = '';
    renderDmMessages(otherHandle, trimmed);
  }

  function startDmPoll(otherHandle){
    if(dmPollTimer) clearInterval(dmPollTimer);
    dmPollTimer = setInterval(async () => {
      if(A.state.currentDmHandle !== otherHandle) return;
      const list = (await sGet(dmKey(A.state.me.handle, otherHandle))) || [];
      renderDmMessages(otherHandle, list);
    }, 4000);
  }
  A.chat.stopDmPoll = () => { if(dmPollTimer) clearInterval(dmPollTimer); };

  document.addEventListener('DOMContentLoaded', () => {
    $('#send-btn').addEventListener('click', sendServerMessage);
    $('#msg-input').addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendServerMessage(); } });
    $('#dm-send-btn').addEventListener('click', sendDmMessage);
    $('#dm-msg-input').addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendDmMessage(); } });
  });
})();
