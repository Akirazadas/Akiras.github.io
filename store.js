/**
 * store.js
 * Camada fina sobre window.storage (persistência do artefato).
 * - sGet/sSet   -> dados COMPARTILHADOS entre todo mundo que abre o Akiline
 *                  (servidores, mensagens, lista de amigos, presença, voz...)
 * - pGet/pSet   -> dados LOCAIS deste dispositivo/navegador apenas
 *                  (sessão de login, "quem sou eu neste aparelho")
 *
 * Também guarda o estado global em memória (window.Akiline.state) que os
 * outros módulos (auth, profile, friends, servers, channels, chat, voice, app)
 * leem e escrevem.
 */
window.Akiline = window.Akiline || {};

(function(){
  async function sGet(key){
    try{ const r = await window.storage.get(key, true); return r && r.value != null ? JSON.parse(r.value) : null; }
    catch(e){ return null; }
  }
  async function sSet(key, val){
    try{ await window.storage.set(key, JSON.stringify(val), true); return true; }
    catch(e){ console.error('[Akiline] falha ao salvar (compartilhado):', key, e); return false; }
  }
  async function pGet(key){
    try{ const r = await window.storage.get(key, false); return r ? r.value : null; }
    catch(e){ return null; }
  }
  async function pSet(key, val){
    try{ await window.storage.set(key, val, false); return true; }
    catch(e){ console.error('[Akiline] falha ao salvar (local):', key, e); return false; }
  }

  function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9); }
  function esc(str){ const d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; }
  function initials(name){ return (name || '?').trim().slice(0,2).toUpperCase(); }
  function timeLabel(ts){ return new Date(ts).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  function genInviteCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for(let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
    return out;
  }

  const AVATAR_COLORS = ['#E8A33D','#D9705F','#7FA087','#6FA8C7','#C58EDB','#E0C25E','#E08F6B','#8CA5D9'];
  const DEFAULT_ROLES = [
    { id:'membro', name:'Membro', color:'#9C8F7C' },
    { id:'fundador', name:'Fundador(a)', color:'#E8A33D' }
  ];

  function defaultServerStructure(name){
    return {
      name: name || 'Novo Servidor',
      categories: [
        { id:'cat-info', name:'INFORMAÇÕES', channels:[
          { id:uid('ch'), name:'avisos', type:'text' },
          { id:uid('ch'), name:'apresentações', type:'text' },
          { id:uid('ch'), name:'regras', type:'text' }
        ]},
        { id:'cat-texto', name:'TEXTO', channels:[
          { id:uid('ch'), name:'geral', type:'text' },
          { id:uid('ch'), name:'jogos', type:'text' },
          { id:uid('ch'), name:'memes', type:'text' },
          { id:uid('ch'), name:'eventos', type:'text' },
          { id:uid('ch'), name:'musica', type:'text' },
          { id:uid('ch'), name:'ajuda', type:'text' }
        ]},
        { id:'cat-voz', name:'VOZ', channels:[
          { id:uid('ch'), name:'Sala Geral', type:'voice' },
          { id:uid('ch'), name:'Jogando', type:'voice' },
          { id:uid('ch'), name:'Estudando', type:'voice' }
        ]}
      ],
      roles: JSON.parse(JSON.stringify(DEFAULT_ROLES))
    };
  }

  window.Akiline.store = { sGet, sSet, pGet, pSet, uid, esc, initials, timeLabel, genInviteCode };
  window.Akiline.constants = { AVATAR_COLORS, DEFAULT_ROLES };
  window.Akiline.defaultServerStructure = defaultServerStructure;

  // Estado global em memória, preenchido durante o boot (app.js)
  window.Akiline.state = {
    me: null,            // { handle, nickname, avatarColor, status, micOn }
    servers: {},         // { serverId: {id, name, ownerHandle, inviteCode, categories, roles} } (cache local)
    myServerIds: [],      // lista de ids dos servidores que este usuário entrou
    currentView: 'home',  // 'home' | 'dm' | 'server'
    currentServerId: null,
    currentChannel: null,
    currentDmHandle: null
  };
})();
