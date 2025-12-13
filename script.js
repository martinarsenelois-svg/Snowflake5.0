// ================= FIREBASE =================
// (YOUR CONFIG — USED AS-IS)
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

const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage(); // (used later)

// ================= UI =================
const authScreen = document.getElementById("authScreen");
const chatScreen = document.getElementById("chatScreen");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");

const chatName = document.getElementById("chatName");
const chatStatus = document.getElementById("chatStatus");

// ================= GLOBAL =================
let currentUser = null;
let peerId = null;
let chatId = null;
let typingTimeout = null;

// ================= AUTH =================
function login() {
  auth.signInWithEmailAndPassword(
    emailInput.value,
    passwordInput.value
  ).catch(e => alert(e.message));
}

function signup() {
  auth.createUserWithEmailAndPassword(
    emailInput.value,
    passwordInput.value
  ).catch(e => alert(e.message));
}

function logout() {
  auth.signOut();
}

// ================= AUTH STATE =================
auth.onAuthStateChanged(user => {
  if (!user) {
    authScreen.classList.add("active");
    chatScreen.classList.remove("active");
    return;
  }

  currentUser = user;
  authScreen.classList.remove("active");
  chatScreen.classList.add("active");

  // peer from URL ?peer=UID
  const params = new URLSearchParams(location.search);
  peerId = params.get("peer");

  if (!peerId) {
    chatName.textContent = "No peer";
    chatStatus.textContent = "add ?peer=UID";
    return;
  }

  chatId = [currentUser.uid, peerId].sort().join("_");
  chatName.textContent = "Chat";

  setupPresence();
  listenPresence();
  listenMessages();
});

// ================= PRESENCE =================
function setupPresence() {
  const userRef = db.ref("presence/" + currentUser.uid);
  userRef.set({ online: true, lastSeen: Date.now() });
  userRef.onDisconnect().set({ online: false, lastSeen: Date.now() });
}

function listenPresence() {
  db.ref("presence/" + peerId).on("value", snap => {
    if (!snap.exists()) {
      chatStatus.textContent = "offline";
      return;
    }
    const p = snap.val();
    chatStatus.textContent = p.online ? "online" : "last seen";
  });
}

// ================= SEND MESSAGE =================
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !chatId) return;

  const msgRef = db.ref("chats/" + chatId + "/messages").push();

  msgRef.set({
    id: msgRef.key,
    text: text,
    from: currentUser.uid,
    to: peerId,
    time: Date.now(),
    delivered: false,
    seen: false,
    disappear: false
  });

  messageInput.value = "";
  setTyping(false);
}

// ENTER KEY
messageInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
  setTyping(true);
});

// ================= TYPING =================
function setTyping(state) {
  if (!chatId) return;

  db.ref("typing/" + chatId + "/" + currentUser.uid).set(state);

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    db.ref("typing/" + chatId + "/" + currentUser.uid).set(false);
  }, 1500);
}

db.ref("typing").on("value", snap => {
  if (!snap.exists() || !chatId) return;
  const t = snap.child(chatId).val();
  if (!t) return;

  const typing = Object.keys(t).some(
    uid => uid !== currentUser.uid && t[uid]
  );

  chatStatus.textContent = typing ? "typing…" : "online";
});

// ================= LISTEN MESSAGES =================
function listenMessages() {
  const msgsRef = db.ref("chats/" + chatId + "/messages");

  msgsRef.on("child_added", snap => {
    renderMessage(snap.val());
    snap.ref.update({ delivered: true });
  });
}

// ================= RENDER =================
function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "message " + (msg.from === currentUser.uid ? "out" : "in");

  const time = new Date(msg.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  let ticks = "";
  if (msg.from === currentUser.uid) {
    if (msg.seen) ticks = "✔✔";
    else if (msg.delivered) ticks = "✔";
  }

  div.innerHTML = `
    <div>${msg.text}</div>
    <div class="meta">
      <span>${time}</span>
      <span class="${msg.seen ? "seen" : ""}">${ticks}</span>
    </div>
  `;

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // mark seen
  if (msg.to === currentUser.uid && !msg.seen) {
    db.ref("chats/" + chatId + "/messages/" + msg.id)
      .update({ seen: true });
  }
}