/**
 * channels.js
 * Sidebar de categorias/canais de um servidor aberto, e troca entre
 * canal de texto (chat.js cuida do conteúdo) e canal de voz (voice.js).
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, esc } = A.store;

  let collapsedCats = {};

  function $(sel){ return document.querySelector(sel); }

  function currentServer(){ return A.state.servers[A.state.currentServerId]; }

  function firstTextChannel(server){
    for(const cat of server.categories){ for(const ch of cat.channels){ if(ch.type==='text') return ch; } }
    return null;
  }
  A.channels_firstTextChannel = firstTextChannel;

  function renderSidebar(){
    const s = currentServer();
    if(!s) return;
    $('#server-name-label').textContent = s.name;
    $('#server-sub-label').textContent = `código: ${s.inviteCode}`;

    const list = $('#channel-list');
    list.innerHTML = '';
    s.categories.forEach(cat => {
      const block = document.createElement('div');
      block.className = 'category-block';
      const collapsed = !!collapsedCats[cat.id];
      block.innerHTML = `
        <div class="category-header ${collapsed?'collapsed':''}" data-cat="${cat.id}">
          <span class="caret">▾</span>
          <span class="cat-name">${esc(cat.name)}</span>
        </div>
        <div class="category-channels ${collapsed?'collapsed':''}"></div>
      `;
      list.appendChild(block);
      const chWrap = block.querySelector('.category-channels');
      cat.channels.forEach(ch => {
        const active = A.state.currentChannel && A.state.currentChannel.id === ch.id;
        const btn = document.createElement('button');
        btn.className = 'channel-btn' + (active ? ' active' : '');
        btn.innerHTML = `<span class="channel-icon">${ch.type==='voice' ? '🔊' : '#'}</span><span>${esc(ch.name)}</span><span class="voice-count" data-voicecount="${ch.id}"></span>`;
        btn.addEventListener('click', () => {
          openChannel(ch);
          if(window.innerWidth <= 680) $('#sidebar').classList.remove('open');
        });
        chWrap.appendChild(btn);
      });
      block.querySelector('.category-header').addEventListener('click', () => {
        collapsedCats[cat.id] = !collapsedCats[cat.id];
        renderSidebar();
      });
    });
    refreshVoiceCounts();
  }
  A.channels = { renderSidebar };

  async function refreshVoiceCounts(){
    const s = currentServer();
    if(!s) return;
    for(const cat of s.categories){
      for(const ch of cat.channels){
        if(ch.type !== 'voice') continue;
        const map = (await sGet('voice:' + s.id + ':' + ch.id)) || {};
        const n = Object.entries(map).filter(([,v]) => Date.now() - v.ts < 20000).length;
        const el = document.querySelector(`[data-voicecount="${ch.id}"]`);
        if(el) el.textContent = n > 0 ? n : '';
      }
    }
  }

  function openChannel(ch){
    if(A.state.currentChannel && A.state.currentChannel.type==='voice' && A.state.currentChannel.id !== ch.id && A.voice.isInVoice()){
      A.voice.leave();
    }
    A.state.currentChannel = ch;
    renderSidebar();
    if(ch.type === 'text'){
      A.voice.stopPoll();
      $('#voice-room').style.display = 'none';
      $('#messages').style.display = 'flex';
      $('#composer').style.display = 'block';
      $('#channel-heading').innerHTML = `# <span id="current-channel">${esc(ch.name)}</span>`;
      $('#channel-topic').textContent = '— papo livre da turma';
      $('#msg-input').disabled = false;
      $('#send-btn').disabled = false;
      A.chat.openServerChannel(A.state.currentServerId, ch.id, true);
    } else {
      A.chat.stopPoll();
      $('#messages').style.display = 'none';
      $('#composer').style.display = 'none';
      $('#voice-room').style.display = 'flex';
      $('#channel-heading').innerHTML = `🔊 <span id="current-channel">${esc(ch.name)}</span>`;
      $('#channel-topic').textContent = '— canal de voz';
      A.voice.enterRoom(A.state.currentServerId, ch.id, ch.name);
    }
  }
  A.channels.openChannel = openChannel;

  document.addEventListener('DOMContentLoaded', () => {
    $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#members-toggle').addEventListener('click', () => $('#members').classList.toggle('open'));
  });
})();
