// 🔥 Firebase config (REPLACE THESE)
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

// UI
const authScreen = document.getElementById("auth");
const chatScreen = document.getElementById("chat");

const email = document.getElementById("email");
const password = document.getElementById("password");
const messages = document.getElementById("messages");
const text = document.getElementById("text");
const statusEl = document.getElementById("status");

// Peer from URL ?peer=UID
const params = new URLSearchParams(location.search);
const peer = params.get("peer");

// Auth
function login() {
  auth.signInWithEmailAndPassword(email.value, password.value)
    .catch(e => alert(e.message));
}

function signup() {
  auth.createUserWithEmailAndPassword(email.value, password.value)
    .catch(e => alert(e.message));
}

function logout() {
  auth.signOut();
}

auth.onAuthStateChanged(user => {
  if (user) {
    authScreen.classList.remove("active");
    chatScreen.classList.add("active");
    loadMessages();
    setStatus("online");
  } else {
    authScreen.classList.add("active");
    chatScreen.classList.remove("active");
  }
});

function chatId() {
  return [auth.currentUser.uid, peer].sort().join("_");
}

// Messaging
function send() {
  if (!text.value || !peer) return;

  db.collection("chats")
    .doc(chatId())
    .collection("messages")
    .add({
      text: text.value,
      from: auth.currentUser.uid,
      time: firebase.firestore.FieldValue.serverTimestamp()
    });

  text.value = "";
}

function loadMessages() {
  if (!peer) {
    statusEl.textContent = "no peer";
    return;
  }

  db.collection("chats")
    .doc(chatId())
    .collection("messages")
    .orderBy("time")
    .onSnapshot(snapshot => {
      messages.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const div = document.createElement("div");
        div.className = "msg " + (m.from === auth.currentUser.uid ? "out" : "in");
        div.textContent = m.text;
        messages.appendChild(div);
      });
      messages.scrollTop = messages.scrollHeight;
    });
}

function setStatus(text) {
  statusEl.textContent = text;
}
