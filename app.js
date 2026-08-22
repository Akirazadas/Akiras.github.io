/**
 * app.js
 * Ponto de entrada. Faz boot da sessão, decide se mostra a tela de login
 * ou o app, e comanda a navegação entre Home (amigos/DMs), conversa direta
 * e visão de servidor.
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { pSet } = A.store;

  function $(sel){ return document.querySelector(sel); }

  async function persistMe(){
    if(!A.state.me) return;
    const dir = await A.auth.getUsersDirectory();
    dir[A.state.me.handle] = {
      ...dir[A.state.me.handle],
      handle: A.state.me.handle,
      nickname: A.state.me.nickname,
      avatarColor: A.state.me.avatarColor,
      status: A.state.me.status
    };
    await A.auth.saveUsersDirectory(dir);
  }
  A.persistMe = persistMe;

  function setActiveRailHome(){
    $('#rail-home').classList.add('active');
    document.querySelectorAll('.server-item').forEach(el => el.classList.remove('active'));
  }
  function clearRailActive(){
    $('#rail-home').classList.remove('active');
  }

  function showView(name){
    A.state.currentView = name;
    $('#home-view').style.display = name === 'home' ? 'flex' : 'none';
    $('#dm-view').style.display = name === 'dm' ? 'flex' : 'none';
    $('#server-view').style.display = name === 'server' ? 'flex' : 'none';
  }

  async function goHome(){
    A.chat.stopPoll(); A.chat.stopDmPoll();
    if(A.voice.isInVoice()) A.voice.leave();
    A.state.currentServerId = null;
    A.state.currentChannel = null;
    A.state.currentDmHandle = null;
    showView('home');
    setActiveRailHome();
    await A.serversApi.renderServerRail();
    A.friends.renderAll();
  }
  A.app = { goHome };

  async function openDm(handle){
    A.chat.stopPoll();
    if(A.voice.isInVoice()) A.voice.leave();
    A.state.currentServerId = null;
    A.state.currentChannel = null;
    A.state.currentDmHandle = handle;
    showView('dm');
    clearRailActive();
    await A.serversApi.renderServerRail();
    A.friends.renderAll();
    A.chat.openDmChat(handle);
  }
  A.app.openDm = openDm;

  async function openServer(serverId){
    A.chat.stopDmPoll();
    A.state.currentDmHandle = null;
    let server = A.state.servers[serverId];
    if(!server) server = await A.serversApi.loadServer(serverId);
    if(!server) return;
    A.state.currentServerId = serverId;
    A.state.currentChannel = null;
    showView('server');
    await A.serversApi.renderServerRail();
    A.channels.renderSidebar();
    const first = A.channels_firstTextChannel(server);
    if(first) A.channels.openChannel(first);
  }
  A.app.openServer = openServer;

  /* ===================== Boot / Login ===================== */
  async function boot(){
    const existing = await A.auth.restoreSession();
    if(existing){
      await enterAppWithUser(existing);
    } else {
      $('#auth-screen').style.display = 'flex';
    }
  }

  async function enterAppWithUser(userRecord){
    A.state.me = {
      handle: userRecord.handle,
      nickname: userRecord.nickname || userRecord.handle,
      avatarColor: userRecord.avatarColor,
      status: userRecord.status || '',
      micOn: true,
      roleId: 'membro'
    };
    $('#auth-screen').style.display = 'none';
    $('#app').style.display = 'flex';
    A.renderYouBoxes();
    A.friends.startPresenceLoop();
    A.friends.startFriendsPoll();
    await goHome();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#rail-home').addEventListener('click', goHome);

    $('#username-login-btn').addEventListener('click', async () => {
      const val = $('#login-username').value;
      const res = await A.auth.loginOrCreate(val, false);
      if(!res.ok){ alert(res.error); return; }
      await enterAppWithUser(res.user);
    });
    $('#login-username').addEventListener('keydown', e => {
      if(e.key === 'Enter') $('#username-login-btn').click();
    });

    $('#google-login-btn').addEventListener('click', async () => {
      // Simulação visual: pedimos um "nome" pra representar a conta Google,
      // deixando claro que não há verificação real do Google aqui.
      const suggested = 'convidado' + Math.floor(Math.random()*9000 + 1000);
      const handle = prompt(
        'Simulação de login com Google (este ambiente não valida contas Google de verdade).\n' +
        'Digite um nome de usuário para continuar:',
        suggested
      );
      if(handle === null) return;
      const res = await A.auth.loginOrCreate(handle, true);
      if(!res.ok){ alert(res.error); return; }
      await enterAppWithUser(res.user);
    });

    boot();
  });
})();
