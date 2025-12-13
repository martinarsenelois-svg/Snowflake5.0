// ================= FIREBASE =================
var firebaseConfig = {
  apiKey: "AIzaSyDWgauZPozTWUVuDGRaMCq2NgARt60p7wA",
  authDomain: "snowflake-62c81.firebaseapp.com",
  databaseURL: "https://snowflake-62c81-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "snowflake-62c81",
  storageBucket: "snowflake-62c81.appspot.com",
  messagingSenderId: "248778051768",
  appId: "1:248778051768:web:5deffaea7073f9ddc2644d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================= STATE =================
const PASSWORD = "2382_BZ";
let username = localStorage.getItem("sf_name") || null;
let myId = localStorage.getItem("sf_id") || Math.random().toString(36).slice(2,9);
localStorage.setItem("sf_id", myId);

let defaultTTL = parseInt(localStorage.getItem("sf_ttl") || "0",10);
let snowEnabled = localStorage.getItem("sf_snow") !== "false";
let isLoggedIn = false;
let realtimeStarted = false;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

// ================= DOM =================
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const settings = document.getElementById("settings");
const messagesDiv = document.getElementById("messages");

const loginPass = document.getElementById("loginPass");
const pwEnter = document.getElementById("pwEnter");
const loginError = document.getElementById("loginError");

const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const attachBtn = document.getElementById("attach");
const fileInput = document.getElementById("fileInput");
const recordBtn = document.getElementById("record");

const typingIndicator = document.getElementById("typingIndicator");
const themeBtn = document.getElementById("theme-toggle");
const openSettingsBtn = document.getElementById("open-settings");
const logoutBtn = document.getElementById("logout");
const clearAdminBtn = document.getElementById("clear-chat-admin");
const defaultTTLSelect = document.getElementById("defaultTTL");
const snowToggle = document.getElementById("snowToggle");
const onlineCountEl = document.getElementById("onlineCount");
const loader = document.getElementById("loader");

// ================= HELPERS =================
function showLoader(show, txt="Uploading…"){
  loader.innerText = txt;
  loader.style.display = show ? "block" : "none";
}

function escapeHtml(s){
  return s ? s.replace(/[&<>"']/g,c=>(
    {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]
  )) : "";
}

function formatTime(t){
  const d = new Date(t);
  return d.getHours()+":"+("0"+d.getMinutes()).slice(-2);
}

// ================= LOGIN =================
pwEnter.onclick = ()=>{
  if(loginPass.value !== PASSWORD){
    loginError.innerText = "Wrong password ❌";
    return;
  }
  loginError.innerText = "";
  if(!username){
    username = prompt("Enter your name") || "User";
    localStorage.setItem("sf_name", username);
  }
  showChat();
};

function showChat(){
  isLoggedIn = true;
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  startRealtime();
}

// ================= REALTIME =================
function startRealtime(){
  if(realtimeStarted) return;
  realtimeStarted = true;

  // Presence
  db.ref("presence/"+myId).set({name:username,online:true});
  db.ref("presence/"+myId).onDisconnect().set({name:username,online:false});

  db.ref("presence").on("value", snap=>{
    const online = Object.values(snap.val()||{}).filter(u=>u.online).length;
    onlineCountEl.innerText = online+" online";
  });

  // Typing
  msgInput.oninput = ()=>{
    db.ref("typing/"+myId).set({name:username,time:Date.now()});
    db.ref("typing/"+myId).onDisconnect().remove();
  };

  db.ref("typing").on("value", snap=>{
    const t = snap.val()||{};
    const others = Object.keys(t).filter(k=>k!==myId);
    typingIndicator.innerText = others.length
      ? `${t[others[0]].name} is typing…`
      : "";
  });

  // Messages
  db.ref("snowflakechat").on("child_added", snap=>{
    renderMessage({...snap.val(), id:snap.key});
  });

  db.ref("snowflakechat").on("child_removed", snap=>{
    const el = document.getElementById("msg_"+snap.key);
    if(el) el.remove();
  });
}

// ================= SEND =================
sendBtn.onclick = sendMessage;
msgInput.onkeydown = e=>{
  if(e.key==="Enter"){ e.preventDefault(); sendMessage(); }
};

function sendMessage(textOverride,fileMeta){
  const text = textOverride ?? msgInput.value.trim();
  if(!text && !fileMeta) return;

  const ref = db.ref("snowflakechat").push();
  ref.set({
    sender: username,
    senderId: myId,
    text: text || "",
    time: Date.now(),
    ttl: defaultTTL || 0,
    fileData: fileMeta?.data || null,
    fileType: fileMeta?.type || null,
    fileName: fileMeta?.name || null
  });

  msgInput.value = "";
}

// ================= FILE UPLOAD =================
attachBtn.onclick = ()=>fileInput.click();
fileInput.onchange = async ()=>{
  const file = fileInput.files[0];
  if(!file) return;
  if(file.size > MAX_FILE_BYTES) return alert("File too large");

  showLoader(true);
  const fr = new FileReader();
  fr.onload = ()=>{
    sendMessage("",{data:fr.result,type:file.type,name:file.name});
    showLoader(false);
  };
  fr.readAsDataURL(file);
};

// ================= RENDER =================
function renderMessage(m){
  if(document.getElementById("msg_"+m.id)) return;

  const div = document.createElement("div");
  div.id = "msg_"+m.id;
  div.className = "msg "+(m.senderId===myId?"me":"other");

  let html = "";
  if(m.fileData){
    if(m.fileType?.startsWith("image"))
      html += `<img src="${m.fileData}" style="max-width:220px;border-radius:10px">`;
    else if(m.fileType?.startsWith("audio"))
      html += `<audio controls src="${m.fileData}"></audio>`;
    else
      html += `<a href="${m.fileData}" download>Download file</a>`;
  }

  if(m.text) html += `<div class="text">${escapeHtml(m.text)}</div>`;

  html += `
    <div class="meta">
      <span>${escapeHtml(m.sender)}</span>
      <span>${formatTime(m.time)}</span>
    </div>
  `;

  div.innerHTML = html;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  if(m.ttl>0){
    setTimeout(()=>db.ref("snowflakechat/"+m.id).remove(),m.ttl*60000);
  }
}

// ================= SETTINGS =================
openSettingsBtn.onclick = ()=>settings.classList.toggle("hidden");

defaultTTLSelect.onchange = ()=>{
  defaultTTL = parseInt(defaultTTLSelect.value,10);
  localStorage.setItem("sf_ttl", defaultTTL);
};

snowToggle.checked = snowEnabled;
snowToggle.onchange = ()=>{
  snowEnabled = snowToggle.checked;
  localStorage.setItem("sf_snow", snowEnabled);
  document.getElementById("snow").style.display = snowEnabled?"block":"none";
};

themeBtn.onclick = ()=>{
  document.body.classList.toggle("dark");
  themeBtn.innerText = document.body.classList.contains("dark")?"☀️":"🌙";
};

logoutBtn.onclick = ()=>{
  localStorage.removeItem("sf_name");
  location.reload();
};

clearAdminBtn.onclick = ()=>{
  if(confirm("Clear all messages?")){
    db.ref("snowflakechat").remove();
    messagesDiv.innerHTML = "";
  }
};

// ================= SNOW =================
const canvas = document.getElementById("snow");
const ctx = canvas.getContext("2d");
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;
let flakes = [];

function initSnow(n=80){
  flakes = Array.from({length:n},()=>({
    x:Math.random()*W,
    y:Math.random()*H,
    r:1+Math.random()*3,
    d:Math.random()*1
  }));
}
function snowLoop(){
  ctx.clearRect(0,0,W,H);
  if(snowEnabled){
    ctx.fillStyle="white";
    flakes.forEach(f=>{
      f.y+=0.5+f.d;
      if(f.y>H){f.y=0;f.x=Math.random()*W;}
      ctx.beginPath();
      ctx.arc(f.x,f.y,f.r,0,Math.PI*2);
      ctx.fill();
    });
  }
  requestAnimationFrame(snowLoop);
}
window.onresize=()=>{
  W=canvas.width=innerWidth;
  H=canvas.height=innerHeight;
  initSnow();
};
initSnow(); snowLoop();