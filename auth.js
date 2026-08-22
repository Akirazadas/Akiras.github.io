/**
 * auth.js
 * Login simplificado por "nome de usuário" (handle), com uma opção de
 * "Entrar com Google" que É UMA SIMULAÇÃO VISUAL.
 *
 * IMPORTANTE (leia antes de mexer): não existe, e não pode existir dentro
 * deste artefato autocontido, uma verificação real de conta Google. Isso
 * exigiria um backend com OAuth 2.0 registrado no Google Cloud Console
 * (client ID, domínio autorizado, troca de token do lado do servidor).
 * O botão abaixo só cria/entra numa conta local do Akiline, do mesmo jeito
 * que o campo de usuário — é deixado claro para o usuário na tela de login.
 */
window.Akiline = window.Akiline || {};

(function(){
  const { sGet, sSet, pGet, pSet } = window.Akiline.store;
  const { AVATAR_COLORS } = window.Akiline.constants;

  function normalizeHandle(raw){
    return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  }

  // Registro global de usuários (compartilhado) — apenas o essencial de perfil.
  async function getUsersDirectory(){
    return (await sGet('users-directory')) || {};
  }
  async function saveUsersDirectory(dir){
    return sSet('users-directory', dir);
  }

  async function loginOrCreate(rawHandle, viaGoogleSim){
    const handle = normalizeHandle(rawHandle);
    if(!handle){
      return { ok:false, error:'Escolhe um nome de usuário válido (letras, números, "_" ou ".").' };
    }
    const dir = await getUsersDirectory();
    let userRecord = dir[handle];
    if(!userRecord){
      userRecord = {
        handle,
        nickname: handle,
        avatarColor: AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)],
        status: '',
        createdVia: viaGoogleSim ? 'google-sim' : 'handle',
        createdAt: Date.now()
      };
      dir[handle] = userRecord;
      await saveUsersDirectory(dir);
    }
    await pSet('session-handle', handle);
    return { ok:true, user: userRecord };
  }

  async function restoreSession(){
    const handle = await pGet('session-handle');
    if(!handle) return null;
    const dir = await getUsersDirectory();
    return dir[handle] || null;
  }

  async function logout(){
    await pSet('session-handle', '');
  }

  window.Akiline.auth = { loginOrCreate, restoreSession, logout, getUsersDirectory, saveUsersDirectory, normalizeHandle };
})();
