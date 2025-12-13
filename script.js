// ---------------- FIREBASE ----------------
// NOTE: keep your same firebaseConfig. Storage not used for base64 mode but leaving storage init is harmless.
var firebaseConfig = {
  apiKey: "AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  authDomain: "snowflake-62c81.firebaseapp.com",
  databaseURL: "https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "snowflake-62c81",
  storageBucket: "snowflake-62c81.appspot.com",
  messagingSenderId: "248778051768",
  appId: "1:248778051768:web:5deffaea7073f9ddc2644d",
  measurementId: "G-S76HLPKWXB"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage(); // not used for uploads in base64 mode

// ---------------- STATE ----------------
const PASSWORD = "2382_BZ";
let username = localStorage.getItem('sf_name') || null;
let myId = localStorage.getItem('sf_id') || (Math.random().toString(36).slice(2,9));
localStorage.setItem('sf_id', myId);
let defaultTTL = parseInt(localStorage.getItem('sf_ttl')||'0',10);
let snowEnabled = (localStorage.getItem('sf_snow')!=='false');
let isRecording = false;
let recorder, audioChunks = [];
let isConverting = false;

// Safe max file size (bytes) — change if you like, but keep small for DB
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

// ---------------- DOM ----------------
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const settings = document.getElementById('settings');
const pwEnter = document.getElementById('pwEnter');
const loginPass = document.getElementById('loginPass');
const loginError = document.getElementById('loginError');
const nameInput = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveName');
const createLinkBtn = document.getElementById('createLink');
const linkOut = document.getElementById('linkOut');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const typingIndicator = document.getElementById('typingIndicator');
const attachBtn = document.getElementById('attach');
const fileInput = document.getElementById('fileInput');
const recordBtn = document.getElementById('record');
const themeBtn = document.getElementById('theme-toggle');
const openSettingsBtn = document.getElementById('open-settings');
const defaultTTLSelect = document.getElementById('defaultTTL');
const snowToggle = document.getElementById('snowToggle');
const logoutBtn = document.getElementById('logout');
const clearAdminBtn = document.getElementById('clear-chat-admin');
const toggleSnowTop = document.getElementById('toggle-snow');

if(username) nameInput.value = username;
defaultTTLSelect.value = String(defaultTTL);
snowToggle.checked = snowEnabled;
toggleSnowTop.addEventListener('click', ()=>{ snowEnabled = !snowEnabled; localStorage.setItem('sf_snow', snowEnabled); document.getElementById('snow').style.display = snowEnabled ? 'block' : 'none'; });

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token') || null;

// ---------------- LOGIN FLOW ----------------
pwEnter.addEventListener('click', ()=> {
  const pass = loginPass.value;
  if(pass === PASSWORD){
    loginError.innerText = '';
    if(!username) {
      username = prompt('Enter your name:') || ('User'+myId);
      localStorage.setItem('sf_name', username);
      nameInput.value = username;
    }
    showChat();
  } else {
    loginError.innerText = 'Wrong password ❌';
  }
});

// name save & link create
saveNameBtn.addEventListener('click', ()=>{
  const v = nameInput.value.trim();
  if(!v) return alert('Enter a name');
  username = v; localStorage.setItem('sf_name', username);
  alert('Saved name: ' + username);
});
createLinkBtn.addEventListener('click', ()=>{
  if(!username) return alert('Save name first');
  const t = Math.random().toString(36).slice(2,10);
  db.ref('users/'+t).set({name:username, created:Date.now()}).catch(err=>{
    console.error('createLink error', err); alert('Failed to create link: '+err.message);
  });
  const l = window.location.origin + window.location.pathname + '?token='+t;
  linkOut.value = l; linkOut.select();
});

// auto-login
if(token){
  db.ref('users/'+token).once('value').then(snap=>{
    const d = snap.val();
    if(d && d.name){ username = d.name; localStorage.setItem('sf_name', username); nameInput.value = username;}
    showChat();
  }).catch(err=>{
    console.error('token lookup failed', err);
    showChat();
  });
} else if(username){
  showChat();
}

function showChat(){
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  settings.classList.add('hidden');
  try {
    db.ref('presence/'+myId).set({name:username, online:true, last:Date.now()});
    db.ref('presence/'+myId).onDisconnect().set({name:username, online:false, last:Date.now()});
  } catch(err){
    console.error('presence error', err);
  }
}

// presence
db.ref('presence').on('value', snap=>{
  try{
    const p = snap.val() || {};
    const arr = Object.values(p).filter(u=>u && u.online);
    const onlineCount = arr.length;
    document.querySelector('.title').innerText = `❄️ Snowflake Chat (${onlineCount} online)`;
  } catch(err){
    console.error('presence on value error', err);
  }
});

// typing
msgInput.addEventListener('input', ()=>{
  try{
    db.ref('typing/'+myId).set({name:username, time:Date.now()});
    db.ref('typing/'+myId).onDisconnect().remove();
  } catch(err){ console.error('typing set error', err); }
});
db.ref('typing').on('value', snap=>{
  const val = snap.val() || {};
  const otherKeys = Object.keys(val).filter(k=>k!==myId);
  if(otherKeys.length>0){
    const person = val[otherKeys[0]].name || 'Someone';
    typingIndicator.innerText = `${person} is typing...`;
  } else typingIndicator.innerText = '';
});

// ---------------- SEND MESSAGE ----------------
sendBtn.addEventListener('click', ()=> sendMessage());
msgInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendMessage(); });

function sendMessage(textOverride, fileMeta){
  if(isConverting) return alert('Please wait a moment; conversion in progress');
  const text = (textOverride !== undefined) ? textOverride : msgInput.value.trim();
  if(!text && !fileMeta) return;
  const ref = db.ref('snowflakechat').push();
  const payload = {
    id: ref.key,
    sender: username,
    senderId: myId,
    text: text || '',
    time: Date.now(),
    deliveredTo: {},
    seenBy: {},
    ttl: fileMeta && fileMeta.ttl!==undefined ? fileMeta.ttl : defaultTTL || 0
  };
  if(fileMeta){
    // store base64 data directly
    payload.fileData = fileMeta.data;   // data:url...base64
    payload.fileType = fileMeta.type;
    payload.fileName = fileMeta.name || ('file_'+Date.now());
  }
  ref.set(payload).then(()=>{
    msgInput.value = '';
    showLocalMessage(payload);
    showHeart();
  }).catch(err=>{
    console.error('sendMessage error', err);
    alert('Failed to send message: '+err.message);
  });
}

// ---------------- FILE ATTACH (BASE64) ----------------
attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  // simple size guard
  if(file.size > MAX_FILE_BYTES){
    alert('File too large. Maximum allowed: '+Math.round(MAX_FILE_BYTES/1024/1024)+' MB');
    fileInput.value = '';
    return;
  }
  try {
    isConverting = true;
    sendBtn.disabled = true; attachBtn.disabled = true;
    const dataUrl = await fileToDataURL(file); // convert
    // send as base64 message
    sendMessage('', {data: dataUrl, type: file.type || 'application/octet-stream', name: file.name, ttl: defaultTTL||0});
    fileInput.value = '';
  } catch(err){
    console.error('file convert/send error', err);
    alert('File send failed: '+err.message);
  } finally {
    isConverting = false;
    sendBtn.disabled = false; attachBtn.disabled = false;
  }
});

// helper: File -> dataURL (Promise)
function fileToDataURL(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> { fr.abort(); reject(new Error('Failed to read file')); };
    fr.onload = ()=> resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

// ---------------- VOICE RECORDING (BASE64) ----------------
recordBtn.addEventListener('click', async ()=>{
  if(isRecording){
    try { recorder.stop(); } catch(e){ console.warn('recorder stop error', e); }
    isRecording = false; recordBtn.innerText = '🎙';
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert('Recording not supported on this device/browser');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    let options = {};
    try {
      if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) options = {mimeType:'audio/webm'};
      else if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg')) options = {mimeType:'audio/ogg'};
    } catch(e){}
    recorder = new MediaRecorder(stream, options);
    audioChunks = [];
    recorder.ondataavailable = e=> audioChunks.push(e.data);
    recorder.onstop = async ()=>{
      try {
        const blob = new Blob(audioChunks,{type: audioChunks[0]?.type || 'audio/webm'});
        if(blob.size > MAX_FILE_BYTES){
          alert('Recording too large to send. Keep short (max ~2MB).');
          return;
        }
        isConverting = true;
        sendBtn.disabled = true; attachBtn.disabled = true; recordBtn.disabled = true;
        const dataUrl = await blobToDataURL(blob);
        sendMessage('', {data: dataUrl, type: blob.type || 'audio/webm', name: 'voice_'+Date.now()+'.webm', ttl: defaultTTL||0});
      } catch(err){
        console.error('voice send error', err); alert('Voice send failed: '+(err.message||err));
      } finally {
        isConverting = false;
        sendBtn.disabled = false; attachBtn.disabled = false; recordBtn.disabled = false;
      }
    };
    recorder.start();
    isRecording = true; recordBtn.innerText = '⏹';
  } catch(err){
    console.error('getUserMedia error', err);
    alert('Could not start recording: '+err.message);
  }
});

function blobToDataURL(blob){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onerror = ()=> { fr.abort(); reject(new Error('Failed to read blob')); };
    fr.onload = ()=> resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

// ---------------- MESSAGES LISTENERS ----------------
const msgsMap = {};
db.ref('snowflakechat').on('child_added', snap=>{
  const dataRaw = snap.val() || {};
  const id = dataRaw.id || snap.key;
  if(!dataRaw.id){
    db.ref('snowflakechat/'+snap.key+'/id').set(id).catch(err=>console.warn('set id back failed', err));
  }
  const data = Object.assign({}, dataRaw, {id});
  msgsMap[id] = data;
  renderMessage(data);
  try {
    const delivered = data.deliveredTo || {};
    delivered[myId] = Date.now();
    db.ref('snowflakechat/'+id+'/deliveredTo').set(delivered).catch(err=>console.warn('delivered set failed', err));
  } catch(err){ console.error('delivered update error', err); }
  if(data.ttl && data.ttl>0){
    setTimeout(()=>{ db.ref('snowflakechat/'+id).remove().catch(e=>console.warn('TTL remove failed', e)); }, data.ttl*60*1000);
  }
});
db.ref('snowflakechat').on('child_changed', snap=>{
  const dataRaw = snap.val() || {};
  const id = dataRaw.id || snap.key;
  const data = Object.assign({}, dataRaw, {id});
  msgsMap[id] = data;
  refreshMessageUI(data);
});
db.ref('snowflakechat').on('child_removed', snap=>{
  const id = snap.key;
  const el = document.getElementById('msg_'+id);
  if(el) el.remove();
});

// ---------------- RENDERING ----------------
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showLocalMessage(m){
  renderMessage(m, true);
}

function renderMessage(m, optimistic){
  const id = m.id;
  if(!id) return;
  let el = document.getElementById('msg_'+id);
  const isMine = m.senderId === myId;
  if(!el){
    el = document.createElement('div');
    el.id = 'msg_'+id;
    el.className = 'msg ' + (isMine ? 'me' : 'other');
    messagesDiv.appendChild(el);
  }
  let inner = '';
  // NEW: handle base64 stored in fileData
  if(m.fileData){
    try {
      if(m.fileType && m.fileType.startsWith('image')) {
        inner += `<img src="${m.fileData}" alt="img" />`;
      } else if(m.fileType && m.fileType.startsWith('audio')) {
        inner += `<audio controls src="${m.fileData}"></audio>`;
      } else {
        // generic file: show download link with filename
        const fname = escapeHtml(m.fileName || 'file');
        inner += `<div class="file"><a href="${m.fileData}" download="${fname}">📁 Download ${fname}</a></div>`;
      }
    } catch(e){ console.error('render file error', e); }
  }
  if(m.text) inner += `<div class="text">${escapeHtml(m.text)}</div>`;
  const time = new Date(m.time || Date.now());
  const tstr = time.getHours()+':'+('0'+time.getMinutes()).slice(-2);
  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;
  const tickHtml = (seen>0) ? '<span class="tick">✅✅</span>' : (delivered>0 ? '<span class="tick">✅</span>' : '');
  inner += `<div class="meta"><strong>${escapeHtml(m.sender)}</strong> · ${tstr} ${tickHtml}</div>`;

  if(isMine){
    inner += `<div style="margin-top:6px"><button data-delete="${id}" class="delete-btn">Delete</button></div>`;
  } else {
    inner += `<div style="margin-top:6px"><button data-report="${id}" class="report-btn">Report</button></div>`;
  }

  el.innerHTML = inner;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if(!isMine){
    try {
      const seenBy = m.seenBy || {};
      if(!seenBy[myId]){
        seenBy[myId] = Date.now();
        db.ref('snowflakechat/'+id+'/seenBy').set(seenBy).catch(err=>console.warn('seenBy set failed', err));
      }
    } catch(err){ console.error('seen update error', err); }
  }

  const deleteBtn = el.querySelector('.delete-btn');
  if(deleteBtn){
    deleteBtn.onclick = ()=> {
      if(confirm('Delete this message for everyone?')){
        db.ref('snowflakechat/'+id).remove().catch(err=>console.warn('delete failed', err));
      }
    };
  }
}

function refreshMessageUI(m){
  const el = document.getElementById('msg_'+m.id);
  if(el) renderMessage(m);
}

// heart animation
function showHeart(){
  const heart = document.createElement('div');
  heart.innerText = '💖';
  heart.style.position = 'absolute';
  heart.style.left = (20 + Math.random()*60) + '%';
  heart.style.bottom = '60px';
  heart.style.fontSize = '24px';
  heart.style.pointerEvents = 'none';
  document.body.appendChild(heart);
  let bottom = 60; let opacity = 1;
  const id = setInterval(()=> {
    bottom += 2; opacity -= 0.03;
    heart.style.bottom = bottom + 'px';
    heart.style.opacity = opacity;
    if(opacity <= 0){ heart.remove(); clearInterval(id); }
  }, 16);
}

// settings + snow + theme + logout + clear
openSettingsBtn.addEventListener('click', ()=> settings.classList.toggle('hidden'));
defaultTTLSelect.addEventListener('change', ()=> {
  defaultTTL = parseInt(defaultTTLSelect.value||'0',10);
  localStorage.setItem('sf_ttl', String(defaultTTL));
});
snowToggle.addEventListener('change', ()=> {
  snowEnabled = snowToggle.checked;
  localStorage.setItem('sf_snow', snowEnabled?'true':'false');
  document.getElementById('snow').style.display = snowEnabled ? 'block' : 'none';
});
themeBtn.addEventListener('click', ()=> {
  document.body.classList.toggle('dark');
  themeBtn.innerText = document.body.classList.contains('dark') ? '☀️' : '🌙';
});
logoutBtn.addEventListener('click', ()=> {
  localStorage.removeItem('sf_name');
  location.reload();
});
clearAdminBtn.addEventListener('click', ()=> {
  if(confirm('Clear ALL messages from database?')){
    db.ref('snowflakechat').remove().catch(err=>console.warn('clear admin failed', err));
    messagesDiv.innerHTML = '';
  }
});

// snow effect (kept same as before)
const canvas = document.getElementById('snow');
const ctx = canvas.getContext('2d');
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
const flakes = [];
for(let i=0;i<200;i++) flakes.push({x:Math.random()*W, y:Math.random()*H, r:Math.random()*4+1, d:Math.random()*2});
function drawSnow(){
  if(!snowEnabled){ ctx.clearRect(0,0,W,H); return; }
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  flakes.forEach(f=>{
    ctx.moveTo(f.x,f.y);
    ctx.arc(f.x,f.y,f.r,0,Math.PI*2,true);
  });
  ctx.fill();
  updateSnow();
}
function updateSnow(){
  flakes.forEach(f=>{
    f.y += f.d;
    if(f.y>H){ f.y=0; f.x=Math.random()*W; }
  });
}
setInterval(drawSnow,33);
window.addEventListener('resize', ()=>{ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

// initial
document.getElementById('snow').style.display = snowEnabled ? 'block' : 'none';
msgInput.addEventListener('focus', ()=>{ typingIndicator.innerText = ''; });