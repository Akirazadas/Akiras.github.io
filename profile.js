/**
 * profile.js
 * Modal de perfil: nome de usuário (handle único), apelido de exibição,
 * cor do avatar, status/frase, cargo no servidor atual, e o indicador de
 * microfone ligado/desligado (refletido em tempo real na you-box e no modal).
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, sSet, esc, initials } = A.store;
  const { AVATAR_COLORS } = A.constants;

  function $(sel){ return document.querySelector(sel); }

  function currentRoles(){
    const srv = A.state.currentServerId ? A.state.servers[A.state.currentServerId] : null;
    return (srv && srv.roles) || A.constants.DEFAULT_ROLES;
  }
  function roleById(id){
    const roles = currentRoles();
    return roles.find(r => r.id === id) || roles[0];
  }
  A.profile_roleById = roleById;

  function renderYouBoxes(){
    const me = A.state.me;
    if(!me) return;
    const initialsTxt = initials(me.nickname);
    document.querySelectorAll('.you-avatar').forEach(el => { el.textContent = initialsTxt; el.style.background = me.avatarColor; });
    document.querySelectorAll('#you-name, #you-name-home, #you-name-dm').forEach(el => { el.textContent = me.nickname; });
    const statusHtml = me.status ? esc(me.status) : `@${esc(me.handle)}`;
    document.querySelectorAll('#you-status-line, #you-status-home, #you-status-dm').forEach(el => { el.innerHTML = statusHtml; });
    document.querySelectorAll('.mic-toggle-mini').forEach(el => {
      el.classList.toggle('muted', !me.micOn);
      el.textContent = me.micOn ? '🎙️' : '🔇';
      el.title = me.micOn ? 'Microfone ligado (clique para mutar)' : 'Microfone mudo (clique para ativar)';
    });
  }
  A.renderYouBoxes = renderYouBoxes;

  async function toggleGlobalMic(){
    A.state.me.micOn = !A.state.me.micOn;
    await A.persistMe();
    renderYouBoxes();
    if(A.voice && A.voice.onGlobalMicToggle) A.voice.onGlobalMicToggle(A.state.me.micOn);
  }

  function openProfileModal(){
    const me = A.state.me;
    $('#profile-handle-input').value = me.handle;
    $('#profile-nickname-input').value = me.nickname;
    $('#profile-status-input').value = me.status || '';
    renderColorSwatches();
    renderRoleSelect();
    updateProfilePreview();
    $('#profile-overlay').classList.add('open');
  }
  A.openProfileModal = openProfileModal;

  function renderColorSwatches(){
    const wrap = $('#profile-color-swatches');
    wrap.innerHTML = AVATAR_COLORS.map(c =>
      `<div class="swatch ${c===A.state.me.avatarColor?'selected':''}" data-color="${c}" style="background:${c}"></div>`
    ).join('');
    wrap.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        A.state.me.avatarColor = sw.dataset.color;
        renderColorSwatches();
        updateProfilePreview();
      });
    });
  }

  function renderRoleSelect(){
    const sel = $('#profile-role-select');
    const roles = currentRoles();
    const inServer = !!A.state.currentServerId;
    sel.disabled = !inServer;
    sel.innerHTML = inServer
      ? roles.map(r => `<option value="${r.id}" ${r.id===(A.state.me.roleId||'membro')?'selected':''}>${esc(r.name)}</option>`).join('')
      : `<option>entre em um servidor primeiro</option>`;
  }

  function updateProfilePreview(){
    const nn = $('#profile-nickname-input').value.trim() || A.state.me.handle;
    $('#profile-avatar-preview').textContent = initials(nn);
    $('#profile-avatar-preview').style.background = A.state.me.avatarColor;
    $('#profile-name-preview').textContent = nn;
    const micOn = A.state.me.micOn;
    $('#profile-mic-dot').textContent = micOn ? '🎙️' : '🔇';
    $('#profile-mic-dot').classList.toggle('muted', !micOn);
    $('#profile-mic-label').textContent = micOn ? 'microfone ligado' : 'microfone desligado';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#profile-nickname-input').addEventListener('input', updateProfilePreview);
    $('#close-profile-btn').addEventListener('click', () => $('#profile-overlay').classList.remove('open'));
    document.querySelectorAll('.mic-toggle-mini').forEach(el => el.addEventListener('click', toggleGlobalMic));

    $('#save-profile-btn').addEventListener('click', async () => {
      const nn = $('#profile-nickname-input').value.trim();
      if(!nn) return;
      A.state.me.nickname = nn.slice(0, 20);
      A.state.me.status = $('#profile-status-input').value.trim().slice(0, 40);
      if(A.state.currentServerId) A.state.me.roleId = $('#profile-role-select').value;
      await A.persistMe();
      renderYouBoxes();
      $('#profile-overlay').classList.remove('open');
      if(A.friends && A.friends.pingPresence) A.friends.pingPresence();
    });

    document.querySelectorAll('#open-profile-btn, #open-profile-btn-home, #open-profile-btn-dm, #open-profile-trigger')
      .forEach(el => el.addEventListener('click', openProfileModal));
  });
})();
