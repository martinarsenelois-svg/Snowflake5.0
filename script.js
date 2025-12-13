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

const auth = firebase.auth();
const db = firebase.database();

// ================= UI =================
const authScreen = document.getElementById("authScreen");
const chatScreen = document.getElementById("chatScreen");
const authError = document.getElementById("authError");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

// ================= AUTH =================
function login() {
  authError.textContent = "Logging in...";
  auth.signInWithEmailAndPassword(
    emailInput.value.trim(),
    passwordInput.value
  ).catch(err => {
    console.error(err);
    authError.textContent = err.message;
  });
}

function signup() {
  authError.textContent = "Creating account...";
  auth.createUserWithEmailAndPassword(
    emailInput.value.trim(),
    passwordInput.value
  ).catch(err => {
    console.error(err);
    authError.textContent = err.message;
  });
}

function logout() {
  auth.signOut();
}

// ================= STATE =================
auth.onAuthStateChanged(user => {
  console.log("AUTH STATE:", user);

  if (!user) {
    authScreen.classList.add("active");
    chatScreen.classList.remove("active");
    return;
  }

  authScreen.classList.remove("active");
  chatScreen.classList.add("active");
});