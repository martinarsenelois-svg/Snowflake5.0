/* =========================
   script.js — Final (Google Blob pack)
   Replace entire script.js with this file
   ========================= */

/* ---------------- FIREBASE ---------------- */
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

/* ---------------- STATE ---------------- */
const PASSWORD = "2382_BZ";
let username = localStorage.getItem('sf_name') || null;
let myId = localStorage.getItem('sf_id') || (Math.random().toString(36).slice(2,9));
localStorage.setItem('sf_id', myId);
let defaultTTL = parseInt(localStorage.getItem('sf_ttl')||'0',10);
let snowEnabled = (localStorage.getItem('sf_snow')!=='false');
let isRecording = false;
let recorder, audioChunks = [];
let isConverting = false;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

/* ---------------- DOM ---------------- */
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

const loaderEl = document.getElementById('loader');

const openEmojiDrawerBtn = document.getElementById('openEmojiDrawer');
const emojiDrawer = document.getElementById('emojiDrawer');
const emojiContainer = document.getElementById('emojiContainer');
const closeEmojiDrawerBtn = document.getElementById('closeEmojiDrawer');

if(username) nameInput.value = username;
defaultTTLSelect.value = String(defaultTTL);
snowToggle.checked = snowEnabled;

/* ---------------- HELPERS ---------------- */
function showLoader(show){ loaderEl.style.display = show ? 'block' : 'none'; }
function showToast(msg){ showLoader(false); loaderEl.innerText = msg; loaderEl.style.display='block'; setTimeout(()=>{ loaderEl.style.display='none'; loaderEl.innerText='Uploading…'; },2000); }
function safeFocus(el){ try{ el.focus({preventScroll:true}); }catch(e){ try{ el.focus(); }catch(e){} } }
function makeTouchFriendly(btn){ if(!btn) return; btn.addEventListener('touchstart',(e)=>{ e.preventDefault(); setTimeout(()=>{ try{ btn.click(); }catch(_){} },8); },{passive:false}); }

/* ensure toolbar buttons don't blur input */
[attachBtn, recordBtn, openEmojiDrawerBtn, sendBtn, pwEnter].forEach(b=>makeTouchFriendly(b));

/* ---------------- LOGIN FIXES ---------------- */
if(loginPass){
  loginPass.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.keyCode === 13){
      e.preventDefault();
      if(pwEnter) pwEnter.click();
    }
  });
}

/* ---------------- LOGIN FLOW ---------------- */
pwEnter.addEventListener('click', ()=> {
  const pass = loginPass.value;
  if(pass === PASSWORD){
    loginError.innerText = '';
    if(!username){
      username = prompt('Enter your name:') || ('User'+myId);
      localStorage.setItem('sf_name', username);
      nameInput.value = username;
    }
    showChat();
  } else {
    loginError.innerText = 'Wrong password ❌';
  }
});

saveNameBtn.addEventListener('click', ()=>{
  const v = nameInput.value.trim();
  if(!v) return showToast('Enter a name');
  username = v; localStorage.setItem('sf_name', username);
  showToast('Saved name: ' + username);
});
createLinkBtn.addEventListener('click', ()=>{
  if(!username) return showToast('Save name first');
  const t = Math.random().toString(36).slice(2,10);
  db.ref('users/'+t).set({name:username, created:Date.now()}).catch(err=>{ console.error(err); showToast('Failed to create link'); });
  const l = window.location.origin + window.location.pathname + '?token='+t;
  linkOut.value = l; linkOut.select();
});

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token') || null;

if(token){
  db.ref('users/'+token).once('value').then(snap=>{
    const d = snap.val();
    if(d && d.name){ username = d.name; localStorage.setItem('sf_name', username); nameInput.value = username; }
    showChat();
  }).catch(err=>{
    console.error('token lookup failed', err);
    showChat();
  });
} else if(username){
  showChat();
}

function showChat(){
  document.body.classList.remove('prelogin');
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  settings.classList.add('hidden');

  try {
    db.ref('presence/'+myId).set({name:username, online:true, last:Date.now()});
    db.ref('presence/'+myId).onDisconnect().set({name:username, online:false, last:Date.now()});
  } catch(err){ console.error('presence error', err); }
}

/* ---------------- PRESENCE / TYPING ---------------- */
db.ref('presence').on('value', snap=>{
  try{
    const p = snap.val() || {};
    const arr = Object.values(p).filter(u=>u && u.online);
    document.querySelector('.title').innerText = `❄️ Snowflake Chat (${arr.length} online)`;
  } catch(e){ console.error(e); }
});

msgInput.addEventListener('input', ()=>{
  try{ db.ref('typing/'+myId).set({name:username, time:Date.now()}); db.ref('typing/'+myId).onDisconnect().remove(); }catch(e){}
});
db.ref('typing').on('value', snap=>{
  const val = snap.val() || {};
  const otherKeys = Object.keys(val).filter(k=>k!==myId);
  if(otherKeys.length>0) typingIndicator.innerText = `${val[otherKeys[0]].name} is typing...`;
  else typingIndicator.innerText = '';
});
setInterval(()=>{ db.ref('typing').once('value').then(snap=>{ const d=snap.val()||{}; Object.keys(d).forEach(k=>{ if(Date.now()-d[k].time>2000) db.ref('typing/'+k).remove().catch(()=>{}); }); }); }, 2000);

/* ---------------- SEND MESSAGE ---------------- */
sendBtn.addEventListener('click', ()=> sendMessage());
msgInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); sendMessage(); } });

async function sendMessage(textOverride, fileMeta){
  if(isConverting) return showToast('Please wait; conversion in progress');
  const text = (textOverride !== undefined) ? textOverride : msgInput.value.trim();
  if(!text && !fileMeta) return;
  const focusedBefore = document.activeElement === msgInput;
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
    payload.fileData = fileMeta.data;
    payload.fileType = fileMeta.type;
    payload.fileName = fileMeta.name || ('file_'+Date.now());
  }
  try {
    await ref.set(payload);
    if(!fileMeta) msgInput.value = '';
    if(focusedBefore || !fileMeta) safeFocus(msgInput);
    showLocalMessage(payload);
    showHeart();
  } catch(err){
    console.error('sendMessage error', err);
    showToast('Failed to send message');
  }
}

/* ---------------- FILE HELPERS ---------------- */
function fileToDataURL(file){ return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onerror=()=>{fr.abort();reject(new Error('Failed to read file'));}; fr.onload=()=>resolve(fr.result); fr.readAsDataURL(file); }); }
function blobToDataURL(blob){ return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onerror=()=>{fr.abort();reject(new Error('Failed to read blob'));}; fr.onload=()=>resolve(fr.result); fr.readAsDataURL(blob); }); }
async function compressImage(file, maxWidth = 800) { return new Promise((resolve,reject)=>{ const img=new Image(); const fr=new FileReader(); fr.onload=()=>{ img.onload=()=>{ const scale=Math.min(1,maxWidth/img.width); const w=Math.round(img.width*scale); const h=Math.round(img.height*scale); const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h); resolve(canvas.toDataURL('image/jpeg',0.75)); }; img.onerror=()=>reject(new Error('Image load failed')); img.src=fr.result; }; fr.onerror=()=>reject(new Error('File read failed')); fr.readAsDataURL(file); }); }

/* ---------------- ATTACH / RECORD ---------------- */
attachBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  if(file.size > MAX_FILE_BYTES){ showToast('File too large.'); fileInput.value=''; return; }
  try{ isConverting=true; showLoader(true); sendBtn.disabled=true; attachBtn.disabled=true; let dataUrl; if(file.type.startsWith('image/')) dataUrl = await compressImage(file,800); else dataUrl = await fileToDataURL(file); await sendMessage('', {data: dataUrl, type: file.type || 'application/octet-stream', name: file.name, ttl: defaultTTL||0}); fileInput.value=''; }catch(err){ console.error(err); showToast('File send failed'); } finally{ isConverting=false; showLoader(false); sendBtn.disabled=false; attachBtn.disabled=false; }
});

recordBtn.addEventListener('click', async ()=>{
  if(isRecording){ try{ recorder.stop(); }catch(e){} isRecording=false; recordBtn.innerText='🎙'; return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showToast('Recording not supported');
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    recorder = new MediaRecorder(stream);
    audioChunks = [];
    recorder.ondataavailable = e=> audioChunks.push(e.data);
    recorder.onstop = async ()=>{
      try{
        const blob = new Blob(audioChunks,{type: audioChunks[0]?.type || 'audio/webm'});
        if(blob.size > MAX_FILE_BYTES){ showToast('Recording too large'); return; }
        isConverting=true; showLoader(true); sendBtn.disabled=true; attachBtn.disabled=true; recordBtn.disabled=true;
        const dataUrl = await blobToDataURL(blob);
        await sendMessage('', {data: dataUrl, type: blob.type || 'audio/webm', name: 'voice_'+Date.now()+'.webm', ttl: defaultTTL||0});
      }catch(err){ console.error(err); showToast('Voice send failed'); } finally{ isConverting=false; showLoader(false); sendBtn.disabled=false; attachBtn.disabled=false; recordBtn.disabled=false; }
    };
    recorder.start();
    isRecording=true; recordBtn.innerText='⏹';
  }catch(err){ console.error(err); showToast('Could not start recording'); }
});

/* ---------------- MESSAGES LISTENERS ---------------- */
const msgsMap = {};
db.ref('snowflakechat').on('child_added', snap=>{
  const dataRaw = snap.val() || {};
  const id = dataRaw.id || snap.key;
  if(!dataRaw.id) db.ref('snowflakechat/'+snap.key+'/id').set(id).catch(()=>{});
  const data = Object.assign({}, dataRaw, {id});
  msgsMap[id] = data;
  renderMessage(data);
  try{ const delivered = data.deliveredTo || {}; delivered[myId] = Date.now(); db.ref('snowflakechat/'+id+'/deliveredTo').set(delivered).catch(()=>{}); }catch(e){}
  if(data.ttl && data.ttl>0) setTimeout(()=>{ db.ref('snowflakechat/'+id).remove().catch(()=>{}); }, data.ttl*60*1000);
});
db.ref('snowflakechat').on('child_changed', snap=>{ const dataRaw = snap.val()||{}; const id = dataRaw.id || snap.key; const data = Object.assign({}, dataRaw, {id}); msgsMap[id]=data; refreshMessageUI(data); });
db.ref('snowflakechat').on('child_removed', snap=>{ const id = snap.key; const el = document.getElementById('msg_'+id); if(el) el.remove(); });

/* ---------------- RENDER ---------------- */
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showLocalMessage(m){ renderMessage(m, true); }

function renderMessage(m, optimistic){
  const id = m.id; if(!id) return;
  let el = document.getElementById('msg_'+id);
  const isMine = m.senderId === myId;
  if(!el){ el = document.createElement('div'); el.id = 'msg_'+id; el.className = 'msg ' + (isMine ? 'me' : 'other'); messagesDiv.appendChild(el); }
  let inner = '';
  if(m.fileData){
    try {
      if(m.fileType && m.fileType.startsWith('image')) inner += `<img src="${m.fileData}" alt="img" />`;
      else if(m.fileType && m.fileType.startsWith('audio')) inner += `<audio controls src="${m.fileData}"></audio>`;
      else { const fname = escapeHtml(m.fileName || 'file'); inner += `<div class="file"><a href="${m.fileData}" download="${fname}">📁 Download ${fname}</a></div>`; }
    } catch(e){ console.error('render file error', e); }
  }
  if(m.text) inner += `<div class="text">${escapeHtml(m.text)}</div>`;
  const time = new Date(m.time || Date.now());
  const tstr = time.getHours()+':'+('0'+time.getMinutes()).slice(-2);
  const delivered = m.deliveredTo ? Object.keys(m.deliveredTo).length : 0;
  const seen = m.seenBy ? Object.keys(m.seenBy).length : 0;
  const tickHtml = (seen>0) ? '<span class="tick">✅✅</span>' : (delivered>0 ? '<span class="tick">✅</span>' : '');
  inner += `<div class="meta"><strong>${escapeHtml(m.sender)}</strong><span>${tstr} ${tickHtml}</span></div>`;

  inner += `
    <div class="msg-menu" aria-hidden="true">
      <button class="menu-btn" title="Options">⋮</button>
      <div class="menu-options" role="menu">
        ${isMine ? `<div class="opt delete" data-delete="${id}">Delete</div>` : `<div class="opt report" data-report="${id}">Report</div>`}
      </div>
    </div>
  `;

  el.innerHTML = inner;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if(!isMine){
    try {
      const seenBy = m.seenBy || {};
      if(!seenBy[myId]){ seenBy[myId] = Date.now(); db.ref('snowflakechat/'+id+'/seenBy').set(seenBy).catch(()=>{}); }
    } catch(err){ console.error('seen update error', err); }
  }

  const menuBtn = el.querySelector('.menu-btn');
  const menuOptions = el.querySelector('.menu-options');
  if(menuBtn && menuOptions){
    menuBtn.onclick = (ev) => {
      ev.stopPropagation();
      const open = menuOptions.classList.toggle('show');
      if(open){
        setTimeout(()=> {
          const closeFn = (e)=> {
            if(!menuOptions.contains(e.target) && e.target !== menuBtn){
              menuOptions.classList.remove('show');
              document.removeEventListener('click', closeFn);
            }
          };
          document.addEventListener('click', closeFn);
        }, 10);
      }
    };
  }

  const deleteOpt = el.querySelector('.opt.delete');
  if(deleteOpt){
    deleteOpt.onclick = ()=> {
      if(confirm('Delete this message for everyone?')){
        db.ref('snowflakechat/'+id).remove().catch(()=>{});
      }
    };
  }
  const reportOpt = el.querySelector('.opt.report');
  if(reportOpt){
    reportOpt.onclick = ()=> {
      alert('Reported');
      menuOptions.classList.remove('show');
    };
  }
}

/* ---------------- HEART ---------------- */
function showHeart(){ const heart = document.createElement('div'); heart.innerText='💖'; heart.style.position='absolute'; heart.style.left=(20+Math.random()*60)+'%'; heart.style.bottom='60px'; heart.style.fontSize='24px'; heart.style.pointerEvents='none'; document.body.appendChild(heart); let bottom=60; let opacity=1; const id=setInterval(()=>{ bottom+=2; opacity-=0.03; heart.style.bottom=bottom+'px'; heart.style.opacity=opacity; if(opacity<=0){ heart.remove(); clearInterval(id);} },16); }

/* ---------------- SETTINGS ---------------- */
openSettingsBtn.addEventListener('click', ()=> settings.classList.toggle('hidden'));
defaultTTLSelect.addEventListener('change', ()=> { defaultTTL = parseInt(defaultTTLSelect.value||'0',10); localStorage.setItem('sf_ttl', String(defaultTTL)); });

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
    db.ref('snowflakechat').remove().catch(()=>{});
    messagesDiv.innerHTML = '';
  }
});

/* ---------------- SNOW ---------------- */
const canvas = document.getElementById('snow');
const ctx = canvas.getContext('2d');
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
const flakes = [];
for(let i=0;i<200;i++) flakes.push({x:Math.random()*W, y:Math.random()*H, r:Math.random()*4+1, d:Math.random()*2});
function drawSnow(){ if(!snowEnabled){ ctx.clearRect(0,0,W,H); return; } ctx.clearRect(0,0,W,H); ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); flakes.forEach(f=>{ ctx.moveTo(f.x,f.y); ctx.arc(f.x,f.y,f.r,0,Math.PI*2,true); }); ctx.fill(); updateSnow(); }
function updateSnow(){ flakes.forEach(f=>{ f.y += f.d; if(f.y>H){ f.y=0; f.x=Math.random()*W; } }); }
const snowInterval = setInterval(drawSnow,33);
window.addEventListener('resize', ()=>{ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

/* ---------------- EMOJI — ORIGINAL GOOGLE BLOB PACK (optimized set) ----------------
   This uses direct URLs from the BlobEmoji GitHub (raw) which are stable for typical use.
   If you want more images added (specific ones from your screenshot), send the names or sample links.
*/

/* curated list of static PNGs (original/google-style blob filenames hosted in repo) */
const blobStaticUrls = [
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/smile.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/grin.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/laugh.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/joy.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/blush.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/heart_eyes.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/kissing.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/silly.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/tongue.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/disappointed.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/sad.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/cry.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/sob.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/angry.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/rage.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/relieved.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/sleeping.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/dizzy.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/sweat.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/party.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/sunglasses.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/thumbsup.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/thumbsdown.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/ok_hand.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/pray.png",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/images/wave.png"
];

/* curated list of animated GIF blobs (originals or community gifs) */
const blobAnimatedUrls = [
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/wave.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/crying.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/bounce.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/happy_bounce.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/party.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/blush.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/kiss.gif",
  "https://raw.githubusercontent.com/BlobEmoji/BlobEmoji/master/gifs/dance.gif"
];

/* Build drawer content from these arrays (skip broken images) */
function preloadImage(url){
  return new Promise((resolve)=> {
    const img = new Image();
    let done = false;
    img.onload = ()=> { if(!done){ done=true; resolve({ok:true, url}); } };
    img.onerror = ()=> { if(!done){ done=true; resolve({ok:false, url}); } };
    img.src = url;
    setTimeout(()=>{ if(!done){ done=true; resolve({ok:false, url}); } }, 3000);
  });
}

async function populateEmojiDrawer(){
  if(!emojiContainer) return;
  emojiContainer.innerHTML = '<div style="padding:12px;color:#666">Loading emojis…</div>';
  const candidates = blobStaticUrls.concat(blobAnimatedUrls);
  const results = await Promise.all(candidates.map(preloadImage));
  const available = results.filter(r=>r.ok).map(r=>r.url);
  if(available.length === 0){
    emojiContainer.innerHTML = '<div style="padding:12px;color:#666">Could not load emojis. Check network or tell me which blobs you want added.</div>';
    return;
  }
  // build nodes
  emojiContainer.innerHTML = '';
  available.forEach(url=>{
    const node = document.createElement('div');
    node.className = 'emoji-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'blob';
    node.appendChild(img);

    node.addEventListener('click', (e)=>{
      e.preventDefault();
      const isGif = url.toLowerCase().endsWith('.gif');
      insertBlobAsMessage(url, isGif);
      setTimeout(()=> closeEmojiDrawer(), 140);
    });

    // long-press preview
    let pressTimer = null;
    node.addEventListener('touchstart', (e)=>{
      pressTimer = setTimeout(()=>{
        const overlay = document.createElement('div');
        overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='rgba(0,0,0,0.7)';
        overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center'; overlay.style.zIndex='1002';
        const big = document.createElement('img'); big.src = url; big.style.maxWidth='90%'; big.style.maxHeight='80%'; big.style.borderRadius='12px';
        overlay.appendChild(big);
        overlay.addEventListener('click', ()=> overlay.remove());
        document.body.appendChild(overlay);
      }, 450);
    }, {passive:true});
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev=> node.addEventListener(ev, ()=> clearTimeout(pressTimer)));

    emojiContainer.appendChild(node);
  });
}

/* open/close emoji drawer */
function openEmojiDrawer(){ if(!emojiDrawer) return; emojiDrawer.classList.remove('hidden'); setTimeout(()=> emojiDrawer.classList.add('show'), 18); emojiDrawer.setAttribute('aria-hidden','false'); populateEmojiDrawer(); }
function closeEmojiDrawer(){ if(!emojiDrawer) return; emojiDrawer.classList.remove('show'); setTimeout(()=>{ emojiDrawer.classList.add('hidden'); emojiDrawer.setAttribute('aria-hidden','true'); }, 320); }

if(openEmojiDrawerBtn) openEmojiDrawerBtn.addEventListener('click', ()=> { if(emojiDrawer.classList.contains('show')) closeEmojiDrawer(); else openEmojiDrawer(); });
if(closeEmojiDrawerBtn) closeEmojiDrawerBtn.addEventListener('click', ()=> closeEmojiDrawer());

/* insert blob image as message (recipients see image) */
function insertBlobAsMessage(url, animated=false){
  sendMessage('', { data: url, type: animated ? 'image/gif' : 'image/png', name: 'blob_'+Date.now() + (animated?'.gif':'.png'), ttl: 0 });
  setTimeout(()=> safeFocus(msgInput), 60);
}

/* final notes: UI wiring already done above */
/* end of script.js */

