/**
 * voice.js
 * Canal de voz de um servidor.
 *
 * O QUE É SINCRONIZADO DE VERDADE (via storage compartilhado):
 *   - quem entrou no canal, se está mutado, se está compartilhando tela.
 * O QUE É SOMENTE LOCAL (não viaja entre dispositivos):
 *   - o áudio do microfone e o vídeo da tela compartilhada em si.
 * Isso porque este ambiente não tem um servidor de mídia (SFU/TURN) para
 * retransmitir áudio/vídeo em tempo real entre navegadores distintos.
 * Para voz/vídeo real entre pessoas, seria necessário um provedor WebRTC
 * com backend (ex.: LiveKit, Agora, Daily).
 */
window.Akiline = window.Akiline || {};

(function(){
  const A = window.Akiline;
  const { sGet, sSet, esc, initials } = A.store;

  let inVoice = false;
  let currentServerId = null, currentChannelId = null, currentChannelName = '';
  let screenSharing = false;
  let localStream = null, screenStream = null, audioCtx = null, analyser = null, speakingRaf = null;
  let voicePollTimer = null;

  function $(sel){ return document.querySelector(sel); }
  function voiceKey(){ return 'voice:' + currentServerId + ':' + currentChannelId; }

  function isInVoice(){ return inVoice; }

  function updateControlsVisibility(){
    $('#voice-controls-idle').style.display = inVoice ? 'none' : 'flex';
    $('#voice-controls-active').style.display = inVoice ? 'flex' : 'none';
  }

  async function enterRoom(serverId, channelId, channelName){
    currentServerId = serverId; currentChannelId = channelId; currentChannelName = channelName;
    inVoice = false;
    $('#voice-room-name').textContent = channelName;
    updateControlsVisibility();
    await renderParticipants();
    startPoll();
  }

  async function join(){
    inVoice = true;
    updateControlsVisibility();
    await setPresence();
    try{
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getAudioTracks().forEach(t => t.enabled = A.state.me.micOn);
      setupSpeakingDetector(localStream);
    } catch(e){
      console.warn('[Akiline] microfone não liberado pelo navegador:', e);
    }
    renderParticipants();
  }

  async function leave(){
    inVoice = false;
    updateControlsVisibility();
    if(localStream){ localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if(screenStream){ screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if(speakingRaf) cancelAnimationFrame(speakingRaf);
    screenSharing = false;
    const map = (await sGet(voiceKey())) || {};
    delete map[A.state.me.nickname];
    await sSet(voiceKey(), map);
    renderParticipants();
  }
  A.voice = { isInVoice, leave, enterRoom };

  function stopPoll(){ if(voicePollTimer) clearInterval(voicePollTimer); }
  A.voice.stopPoll = stopPoll;

  function onGlobalMicToggle(micOn){
    if(localStream) localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    if(inVoice){
      $('#toggle-mic-btn').textContent = micOn ? '🎙️ Mic ligado' : '🔇 Mic mudo';
      $('#toggle-mic-btn').classList.toggle('active', micOn);
      setPresence();
    }
  }
  A.voice.onGlobalMicToggle = onGlobalMicToggle;

  async function toggleScreenShare(){
    if(!screenSharing){
      try{
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenSharing = true;
        $('#toggle-screen-btn').textContent = '🛑 Parar compartilhamento';
        $('#toggle-screen-btn').classList.add('active');
        screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
        await setPresence();
        renderParticipants();
      } catch(e){
        console.warn('[Akiline] compartilhamento de tela cancelado ou não permitido:', e);
      }
    } else {
      stopScreenShare();
    }
  }

  function stopScreenShare(){
    if(screenStream){ screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    screenSharing = false;
    $('#toggle-screen-btn').textContent = '🖥️ Compartilhar tela';
    $('#toggle-screen-btn').classList.remove('active');
    setPresence();
    renderParticipants();
  }

  async function setPresence(){
    if(!inVoice) return;
    const map = (await sGet(voiceKey())) || {};
    map[A.state.me.nickname] = {
      ts: Date.now(), muted: !A.state.me.micOn, sharingScreen: screenSharing,
      avatarColor: A.state.me.avatarColor, roleId: A.state.me.roleId || 'membro'
    };
    await sSet(voiceKey(), map);
  }

  function setupSpeakingDetector(stream){
    try{
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a,b) => a+b, 0) / data.length;
        const tile = document.querySelector('[data-self-tile="1"]');
        if(tile) tile.classList.toggle('speaking', avg > 14 && A.state.me.micOn);
        speakingRaf = requestAnimationFrame(loop);
      };
      loop();
    } catch(e){ console.warn('[Akiline] detector de fala indisponível:', e); }
  }

  async function renderParticipants(){
    const server = A.state.servers[currentServerId];
    if(!server) return;
    const map = (await sGet(voiceKey())) || {};
    const now = Date.now();
    const entries = Object.entries(map).filter(([,v]) => now - v.ts < 20000);
    const grid = $('#voice-participants');
    if(entries.length === 0 && !inVoice){
      grid.innerHTML = '<div class="voice-empty">Ninguém no canal ainda. Chama a galera!</div>';
      return;
    }
    grid.innerHTML = entries.map(([name, v]) => {
      const isSelf = name === A.state.me.nickname;
      const role = (server.roles.find(r => r.id === (v.roleId||'membro'))) || server.roles[0];
      return `
      <div class="participant-tile" ${isSelf ? 'data-self-tile="1"' : ''}>
        <div class="p-badges">
          ${v.muted ? '<span class="p-badge">🔇</span>' : ''}
          ${v.sharingScreen ? '<span class="p-badge">🖥️</span>' : ''}
        </div>
        ${isSelf && screenSharing ? '<video id="self-screen-video" autoplay muted></video>' : `<div class="p-avatar" style="background:${v.avatarColor||'#9C8F7C'}">${esc(initials(name))}</div>`}
        <div class="p-name">${esc(name)}${isSelf ? ' (você)' : ''}</div>
        <div style="font-size:10px; color:${role.color};">${esc(role.name)}</div>
      </div>`;
    }).join('');
    if(screenSharing && screenStream){
      const vid = document.getElementById('self-screen-video');
      if(vid) vid.srcObject = screenStream;
    }
  }

  function startPoll(){
    stopPoll();
    voicePollTimer = setInterval(() => { if(currentChannelId) renderParticipants(); }, 3000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#join-voice-btn').addEventListener('click', join);
    $('#leave-voice-btn').addEventListener('click', leave);
    $('#toggle-mic-btn').addEventListener('click', async () => {
      A.state.me.micOn = !A.state.me.micOn;
      await A.persistMe();
      A.renderYouBoxes();
      onGlobalMicToggle(A.state.me.micOn);
    });
    $('#toggle-screen-btn').addEventListener('click', toggleScreenShare);
  });
})();
