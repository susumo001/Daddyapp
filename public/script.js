// ====== GLOBALS ======
let currentUser = null; // backend se milega
let authToken = localStorage.getItem("authToken") || null;

// ====== API HELPERS ======
async function apiRequest(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data;
}
loadUserRecords?.();
loadWithdrawRecords?.();

// ====== UTILS ======
function switchTab(tab) {
  document.getElementById("registerForm").style.display = tab === "register" ? "block" : "none";
  document.getElementById("loginForm").style.display = tab === "login" ? "block" : "none";
  document.getElementById("registerTab").classList.toggle("active", tab === "register");
  document.getElementById("loginTab").classList.toggle("active", tab === "login");
}

// ====== REGISTER ======
async function register() {
  const phone = document.getElementById("regPhone").value.trim();
  const pass = document.getElementById("regPass").value;
  const confirm = document.getElementById("regPassConfirm").value;
  const referredBy = document.getElementById("referralCode").value.trim();

  if (!phone || !pass || !confirm) return alert("Fill all fields");
  if (pass !== confirm) return alert("Passwords do not match");

  try {
    await apiRequest("/register", "POST", { phone, password: pass, referral: referredBy });
    alert("Registered successfully! Please login.");
    switchTab("login");
  } catch (err) {
    alert(err.message);
  }
}


// ====== LOGIN ======
async function login() {
  const phone = document.getElementById("loginPhone").value.trim();
  const pass = document.getElementById("loginPass").value;

  try {
    const data = await apiRequest("/login", "POST", { phone, password: pass });

    // 🔹 Backend se token aur user info milega
    authToken = data.token;
    localStorage.setItem("authToken", authToken);
    currentUser = data.user.phone;
    currentUserPhone = data.user.phone; //removewal

    // UI refresh
    showCurrentUserId();
    creditDailyIncome();
    updateIncomeDisplay();
    showTransactions();
    updateBalanceDisplay();
    updateVipDisplay();
    updateIncomeDetails();
    
    
    

    document.getElementById("auth").style.display = "none";
    document.getElementById("app").style.display = "block";

    showPage?.("home");
    loadInviteLink?.();
    switchLevel?.(1);
  } catch (err) {
    alert(err.message || "Invalid phone or password");
  }
}
function showCurrentUserId() {
  document.getElementById("userId").innerText = currentUser;
}

// 1. AAPKA PURANA showPage FUNCTION ISSE REPLACE KAREIN
// YEH FUNCTION SARE PAGES KO BAND KARKE SIRF EK .page DIKHATA HAI
function showPage(pageId) {
  // Pehle, sabhi .page aur .fullpage ko hide karein
  document.querySelectorAll(".page, .fullpage").forEach(p => {
    p.style.display = "none";
  });
  
  // Ab, sirf target .page ko dikhayein
  document.getElementById(pageId).style.display = "block";

  // Scroll top (yeh sahi hai)
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  // Nav item active karein (yeh sahi hai)
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(n => n.classList.remove("active"));
  const index = { home: 0, share: 1, team: 2, my: 3 }[pageId];
  if (index !== undefined) navItems[index].classList.add("active");
}


function copyLink() {
  const link = document.getElementById("inviteLink");
  link.select();
  document.execCommand("copy");
  alert("Link copied!");
}

// ✅ Backend se referral link load karega
async function loadInviteLink() {
  if (!authToken) return;
  try {
    const data = await apiRequest("/me", "GET"); // backend user profile
    const code = data.user.refCode;
    const link = `${window.location.origin}${window.location.pathname}?ref=${code}`;
    document.getElementById("inviteLink").value = link;
  } catch (err) {
    console.warn("Invite link load failed:", err.message);
  }
}

function loadReferralFromURL() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) document.getElementById("referralCode").value = ref;
}

window.onload = async function () {
  loadReferralFromURL();

  if (authToken) {
    try {
      const data = await apiRequest("/me", "GET");
      currentUser = data.user.phone;

      document.getElementById("auth").style.display = "none";
      document.getElementById("app").style.display = "block";

      showPage("home");
      loadInviteLink();
      showCurrentUserId();
      switchLevel(1);
    } catch (err) {
      console.warn("Auto-login failed:", err.message);
    }
  }

  const $ = s => document.querySelector(s);
const toggle = (a,b,x,y) => {
  $(a).classList.add("active");
  $(b).classList.remove("active");
  $(x).style.display="block";
  $(y).style.display="none";
};

$("#stableBtn").onclick  = () => toggle("#stableBtn","#activityBtn","#stableSection","#activitySection");
$("#activityBtn").onclick = () => toggle("#activityBtn","#stableBtn","#activitySection","#stableSection");

  // Input limit for mobile
  const regPhone = document.getElementById("regPhone");
  const loginPhone = document.getElementById("loginPhone");
  if (regPhone) regPhone.addEventListener("input", () => {
    regPhone.value = regPhone.value.replace(/\D/g, '').slice(0, 10);
  });
  if (loginPhone) loginPhone.addEventListener("input", () => {
    loginPhone.value = loginPhone.value.replace(/\D/g, '').slice(0, 10);
  });
};

// ✅ Logout ab sirf token hataega
function logout() {
  localStorage.removeItem("authToken");
  authToken = null;
  currentUser = null;
  document.getElementById("auth").style.display = "block";
  document.getElementById("app").style.display = "none";
}

// ✅ openProfilePage (Profile Flow)
function openProfilePage(pageId) {
  // 1. Sirf main .page ko hide karein (my, home, etc.)
  document.querySelectorAll(".fullpage").forEach(p => p.style.display = "none");
  
  // 2. Menu list ko hide karein (yeh sahi hai)
  document.querySelector(".menu-list").style.display = "none";
  
  // 3. Target profile page (.fullpage) ko dikhayein
  document.getElementById(pageId).style.display = "block";

  // ... (Aapka baaki ka code waisa hi rahega) ...
  if (pageId === "incomePage") updateIncomeDetails();
  
  if (pageId === "bindWalletPage") {
    loadAndDisplayWalletDetails(); // Yeh function pichhle step mein diya tha
  }
}


// 5. AAPKA PURANA closeProfilePage FUNCTION ISSE REPLACE KAREIN
function closeProfilePage() {
  // Sabhi .fullpage ko hide karein
  document.querySelectorAll(".fullpage").forEach(p => {
    p.style.display = "none";
  });
  
  // 'my' page ko waapas dikhayein
  showPage('my');
  
  // Menu list ko waapas dikhayein
  document.querySelector(".menu-list").style.display = "block";
}

// 4. AAPKA PURANA closeFullPage FUNCTION ISSE REPLACE KAREIN
function closeFullPage() {
  // Sabhi .fullpage ko hide karein
  document.querySelectorAll(".fullpage").forEach(p => {
    p.style.display = "none";
  });
  
  // 'home' page ko waapas dikhayein
  showPage('home');
}

// ✅ openFullPage (Withdraw Flow)
// 2. AAPKA PURANA openFullPage FUNCTION ISSE REPLACE KAREIN


// --------- frontend.js (replace existing script) ----------
// ✅ Frontend JS

let selectedChannel = 1;  // default channel 1 = QR
let currentRechargeId = null;

// Quick amount set
function setAmount(val) {
  document.getElementById("rechargeInput").value = val;
}

// Channel select
function selectChannel(ch) {
  selectedChannel = ch;
  if (ch === 1) {
    document.getElementById("radio-ptm").checked = true;
  } else {
    document.getElementById("radio-qepay").checked = true;
  }
}

// Recharge button click
async function confirmRecharge() {
  const amount = parseFloat(document.getElementById("rechargeInput").value);
  if (!amount || amount <= 0) {
    alert("Enter valid amount");
    return;
  }

  try {
    const res = await fetch("/api/recharge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken,
      },
      body: JSON.stringify({ amount, channel: selectedChannel }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Recharge failed");
      return;
    }

    // store rechargeId for UTR submit
    currentRechargeId = data.recharge._id;

    // UI update
    document.getElementById("displayAmount").innerText = `₹${data.recharge.amount}`;
    document.getElementById("directAmountText").innerText = `₹${data.recharge.amount}`;
    document.getElementById("directAmount").value = `${data.recharge.amount}`;
    document.getElementById("qrAmountText").innerText = `₹${data.recharge.amount}`;
    document.getElementById("directVpa").value = data.recharge.selectedUPI || "";

    // channel-wise confirm page
    if (selectedChannel === 1) {
      document.getElementById("confirm-qr").style.display = "block";
      document.getElementById("confirm-direct").style.display = "none";
      // Generate QR
      if (typeof QRCode === "function" || window.QRCode) {
        document.getElementById("qrBox").innerHTML = "";
        new QRCode(document.getElementById("qrBox"), {
      text: data.upiUrl,   // pehle selectedUPI tha
      width: 180,
      height: 180,
    });
      }
    } else {
      document.getElementById("confirm-direct").style.display = "block";
      document.getElementById("confirm-qr").style.display = "none";
    }

    // show confirm page
    document.getElementById("rechargePage").style.display = "none";
    document.getElementById("rechargeConfirmPage").style.display = "block";

    // Start 10 min timer
    const createdAt = data.recharge.createdAt ? new Date(data.recharge.createdAt) : new Date();
    const now = Date.now();
    const leftSec = Math.max(
      0,
      Math.floor((createdAt.getTime() + 10 * 60 * 1000 - now) / 1000)
    );
    startCountdown(leftSec);

  } catch (err) {
    console.error("confirmRecharge error:", err);
    alert("Something went wrong");
  }
}



// Timer function
let countdownInterval;
function startCountdown(sec) {
  clearInterval(countdownInterval);
  let left = sec;
  function update() {
    const m = String(Math.floor(left / 60)).padStart(2, "0");
    const s = String(left % 60).padStart(2, "0");
    document.getElementById("countdown").innerText = `00:${m}:${s}`;
    if (left <= 0) {
      clearInterval(countdownInterval);
      document.getElementById("countdown").innerText = "Expired";
    }
    left--;
  }
  update();
  countdownInterval = setInterval(update, 1000);
}

// Copy function
function copyText(id) {
  const input = document.getElementById(id);
  input.select();
  input.setSelectionRange(0, 99999);
  document.execCommand("copy");
  alert("Copied: " + input.value);
}

// Submit UTR
async function submitUTR(type) {
  let utr = "";
  if(type === "direct"){
    utr = document.getElementById("utrInputDirect").value.trim();
  } else {
    utr = document.getElementById("utrInputQR").value.trim();
  }
  if (!utr) {
    showSuccessToast("Please enter UTR !");
    return;
  }

  try {
    const res = await fetch(`/api/recharge/submit-utr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authToken,
      },
      body: JSON.stringify({ rechargeId: currentRechargeId, utr }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to submit UTR");
      return;
    }
    showSuccessToast("UTR submited");
    // refresh records
    loadUserRecords();
  } catch (err) {
    console.error("UTR error:", err);
    alert("Server error");
  }
}

// Load user recharge records
async function loadUserRecords() {
  try {
    const res = await fetch("/api/my-recharges", {
      headers: { Authorization: "Bearer " + authToken },
    });
    const data = await res.json();
    if (!res.ok) return;

    const listDiv = document.getElementById("records-list");
    if (!data.recharges || data.recharges.length === 0) {
      listDiv.innerHTML = "<p>No records</p>";
      return;
    }

    listDiv.innerHTML = data.recharges
      .map((r) => {
        // status color
        let color = "black";
        if (r.status === "pending") color = "orange";
        if (r.status === "rejected") color = "red";
        if (r.status === "confirmed") color = "green";

        return `
          <div class="record-box" style="
            background:#f5f5f5;
            border-radius:8px;
            padding:10px;
            margin-bottom:10px;
            display:flex;
            justify-content:space-between;
            align-items:center;
          ">
            <!-- Left Side -->
            <div style="text-align:left; font-size:14px; ">
              <p><b>Order:</b> ${r.orderId}</p>
              <p><b>UTR :</b> ${r.utr || "-"}</p>
              <p><b>Status:</b> <span style="color:${color}">${r.status}</span></p>
            </div>

            <!-- Right Side (Amount) -->
            <div style="font-size:23px; font-weight:bold; color:#000; Right:9px;">
              ₹${r.amount}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error("records error:", err);
  }
}

function validateAndSubmitUTR(rechargeId) {
  const input = document.getElementById(`utr-${rechargeId}`);
  const utr = input.value.trim();
  if (!/^\d{12}$/.test(utr)) {
    showSuccessToast("Please enter a valid UTR !");
    return;
  }

  fetch('/api/recharge/submit-utr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({ rechargeId, utr })
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) alert(data.error);
    else {
      showSuccessToast("Recharge success");
      loadUserRecords(); // refresh UI
    }
  })
  .catch(err => { console.error(err); alert('Network error'); });
}


// ✅ Withdraw confirm function
async function confirmWithdraw() {
  const amount = document.getElementById("withdraw Input").value;
  const tradePass = document.getElementById("trade input").value;

  if (!amount || !tradePass) {
    showSuccessToast("enter amount and trade password!");
    return;
  }

  try {
    const res = await fetch("/api/withdraw", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("authToken"),
      },
      body: JSON.stringify({ amount, tradePass }),
    });

    const data = await res.json();

    if (data.success) {
      showSuccessToast("Withdraw success");
      document.getElementById("withdraw Input").value = "";
      document.getElementById("trade input").value = "";
      loadWithdrawRecords(); // record refresh
      updateIncomeDisplay?.();
    } else {
      alert(data.error || "Withdraw failed");
    }
  } catch (err) {
    console.error("Withdraw error:", err);
    alert("Server error");
  }
}

// ✅ Load Withdraw Records
async function loadWithdrawRecords() {
  try {
    const res = await fetch("/api/my-withdraws", {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("authToken"),
      },
    });
    const data = await res.json();
    const container = document.getElementById("withrawRecord");

    let html = `<h3><span style="padding-left: 8px;">My Record</span></h3><br>`;
    if (data.withdraws.length === 0) {
      html += "<p>No withdraw records</p>";
    } else {
      data.withdraws.forEach((w) => {
        const fee = (w.amount - w.finalAmount).toFixed(2);
        let color =
          w.status === "completed"
            ? "green"
            : w.status === "pending"
            ? "orange"
            : "red";

        html += `
          <div class="record-card">
            <p><strong style="font-size: 26px;
            color: #800;">₹${w.amount}</strong> (Fee: ₹${fee})</p>
            <p>final Amount: <strong>₹${w.amount*0.9}</strong></p>
            <p>Status: <span style="color:${color}">${w.status}</span></p>
            <p>Date: ${new Date(w.createdAt).toLocaleString()}</p>
           <br> <hr><br>
          </div>
        `;
      });
    }
    container.innerHTML = html;
  } catch (err) {
    console.error("Record fetch error:", err);
  }
}

// ==========================================================
// STEP 1: DO HELPER FUNCTION (Form ko reset/khaali karne ke liye)
// ==========================================================
function resetBindForm() {
  // Input fields ko khaali karein
  document.getElementById("realName").value = "";
  document.getElementById("ifsc").value = "";
  document.getElementById("accountNumber").value = "";
  document.getElementById("tradePass").value = "";
  document.getElementById("tradePass").placeholder = "Set a trade password";

  // Fields ko editable (read-only = false) karein
  document.getElementById("realName").readOnly = false;
  document.getElementById("ifsc").readOnly = false;
  document.getElementById("accountNumber").readOnly = false;
  document.getElementById("tradePass").readOnly = false;

  // Button ko reset karein
  const btn = document.getElementById("bindButton");
  btn.innerText = "Confirm";
  btn.disabled = false;
}

// ==========================================================
// STEP 2: DOOSRA HELPER FUNCTION (Details load karke Read-Only karne ke liye)
// ==========================================================
async function loadAndDisplayWalletDetails() {
  try {
    // Hum assume kar rahe hain ki apiRequest function aapke paas hai
    const data = await apiRequest("/check-bank", "GET"); 

    if (data.bound) {
      // Wallet BOUND HAI: Details fill karo aur Read-Only karo
      const d = data.details;
      document.getElementById("realName").value = d.realName;
      document.getElementById("ifsc").value = d.ifsc;
      document.getElementById("accountNumber").value = d.accountNumber;
      document.getElementById("tradePass").placeholder = "Already Set";

      // Fields ko read-only karein
      document.getElementById("realName").readOnly = true;
      document.getElementById("ifsc").readOnly = true;
      document.getElementById("accountNumber").readOnly = true;
      document.getElementById("tradePass").readOnly = true;

      // Button ko update karein
      const btn = document.getElementById("bindButton");
      btn.innerText = "Wallet Already Bound";
      btn.disabled = true;
    } else {
      // Wallet BOUND NAHI HAI: Form ko khaali (reset) rakho
      resetBindForm();
    }
  } catch (err) {
    console.error("Wallet details load error:", err);
    // Error par bhi form reset kar dein
    resetBindForm();
  }
}

// ✅ Bind Wallet (Form Submit)
async function bindWallet() {
  const realName = document.getElementById("realName").value.trim();
  const ifsc = document.getElementById("ifsc").value.trim();
  const accountNumber = document.getElementById("accountNumber").value.trim();
  const tradePass = document.getElementById("tradePass").value.trim();

  if (!realName || !ifsc || !accountNumber || !tradePass) {
    showSuccessToast("fill All Feild!");
    return;
  }

  try {
    const data = await apiRequest("/bind-wallet", "POST", {
      realName,
      ifsc,
      accountNumber,
      tradePass,
    });

    alert("Wallet bound successfully!");
    
    // YEH BADLAAV KAREIN:
    // checkWallet() ki jagah naya function call karein taaki form refresh ho
    loadAndDisplayWalletDetails(); 

  } catch (err) {
    alert(err.message || "Failed to bind wallet");
    console.error("Bind wallet error:", err);
  }
}




// ====== PASSWORD CHANGE ======

document.getElementById('passwordChangeForm').addEventListener('submit', handlePasswordChange);
// 1. Event Listener ko form se jodein

document.addEventListener('DOMContentLoaded', () =>

{
setupPasswordToggle(); // Password toggle functionality ko setup karein

});




async function handlePasswordChange(event) {
    event.preventDefault(); // Form ko default submit hone se rokta hai

    // 1. Inputs se data lein
    const originalPass = document.getElementById('originalPass').value.trim();
    const newPass = document.getElementById('newPass').value.trim();
    const confirmPass = document.getElementById('confirmPass').value.trim();
    
    // 2. Client-Side Validation
    if (!originalPass || !newPass || !confirmPass) {
        return alert("Please fill all password fields.");
    }
    
    if (newPass !== confirmPass) {
        return alert("New Password and Confirm Password do not match.");
    }

    if (newPass.length < 6) {
        return alert("New Password must be at least 6 characters long.");
    }

    try {
        // 3. API Request Call
        const dataToSend = {
            original_password: originalPass,
            new_password: newPass
        };
        
        // Zaroori: Token ko 'apiRequest' function khud-ba-khud header mein add kar dega.
        const response = await apiRequest("/change-password", "POST", dataToSend);

        alert(response.message || "Password updated successfully!");
        
        logout();
        
        document.getElementById('passwordChangeForm').reset();

    } catch (err) {
        console.error('Password Change Error:', err);
        alert(err.message); 
    }
}



// 3. Password Show/Hide Toggle functionality
function setupPasswordToggle() {
    const toggles = document.querySelectorAll('.password-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const inputGroup = toggle.closest('.input-group');
            const inputField = inputGroup.querySelector('input[type="password"], input[type="text"]');
            
            if (inputField.type === 'password') {
                inputField.type = 'text';
                toggle.textContent = '🙈'; // Hide icon
            } else {
                inputField.type = 'password';
                toggle.textContent = '👁️'; // Show icon
            }
        });
    });
}

// public/script.js

// === 1. Variables ko globally declare karein (lekin value mat dein) ===
let chatMessages;
let chatOptions;
// Token ko bhi yahaan le aana behtar hai
const token = localStorage.getItem('authToken');

// === 2. DOMContentLoaded mein variables ko value dein ===
document.addEventListener('DOMContentLoaded', () => {
  // Ab yeh global variables ko find karke value dega
  chatMessages = document.getElementById('chat-messages');
  chatOptions = document.getElementById('chat-options');
  
  // ❗️ Yahaan se initializeChat() ko call HATA DEIN
  // initializeChat(); // <-- IS LINE KO HATA DEIN
});

// === 3. Aapke saare page navigation functions (GLOBAL) ===
// (Inko waise hi rehne dein jaisa pichhli baar bataya tha)

async function openFullPage(id) {
  // Pehle, sabhi .page aur .fullpage ko hide karein
  document.querySelectorAll(".page, .fullpage").forEach(p => {
    p.style.display = "none";
  });
  // Ab, sirf target .fullpage ko dikhayein
  document.getElementById(id).style.display = "block";

  // --- Aapka baaki ka code waisa hi rahega ---
  const amountInput = document.getElementById("rechargeInput");
  if (amountInput) amountInput.value = "";

  if (id === "rechargePage") {
    loadUserRecords();
  }

  if (id === "withdrawPage") {
    try {
      const data = await apiRequest("/check-bank", "GET"); // apiRequest use karein

      if (!data.bound) {
        document.getElementById("withdrawPage").style.display = "none";
        document.getElementById("bindWalletPage").style.display = "block";
        resetBindForm(); // Form ko reset karein
      }
    } catch (err) {
      console.error("Bank check error:", err);
    }
  }

  // YEH AB KAAM KAREGA
  if (id === "servicePage") {
    initializeChat(); // Ab yeh global function ko call karega
  }
}



// 1. Chat window mein message display karne ka function
function displayMessage(text, sender) { 
  if (!chatMessages) return; // Agar chat page khula nahi hai toh kuch na karein
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  messageElement.innerText = text;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 2. Options (buttons) display karne ka function
function displayOptions(options) {
  if (!chatOptions) return; // Agar chat page khula nahi hai toh kuch na karein
  chatOptions.innerHTML = '';
  if (!options) return;

  options.forEach(option => {
    const button = document.createElement('button');
    button.classList.add('option-btn');
    button.innerText = option.text;
    button.dataset.keyword = option.keyword;
    button.addEventListener('click', handleOptionClick);
    chatOptions.appendChild(button);
  });
}

// 3. Jab user koi option click karta hai
async function handleOptionClick(event) {
  const userText = event.target.innerText;
  const keyword = event.target.dataset.keyword;
  displayMessage(userText, 'user');
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
  });
  await getBotResponse(keyword, userText);
}

// 4. Backend API ko call karne ka function
async function getBotResponse(keyword, userText = null) {
  const token = localStorage.getItem('authToken'); // har call me fresh
  if (!token) {
    displayMessage('Authentication Error. कृपया पहले लॉग इन करें।', 'bot');
    return;
  }
  const authHeader = { 'Authorization': `Bearer ${token}` };

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ keyword, userText })
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json();
    setTimeout(() => {
      displayMessage(data.reply, 'bot');
      displayOptions(data.options);
    }, 500);
  } catch (error) {
    console.error('Error:', error);
    displayMessage('Oops! Kuch gadbad ho gayi.', 'bot');
  }
}

// 5. Purani chat history load karein
async function loadChatHistory() {
  const token = localStorage.getItem('authToken');
  if (!token) return; 

  const authHeader = { 'Authorization': `Bearer ${token}` };

  try {
    const response = await fetch('/api/chat/history', { headers: authHeader });
    if (!response.ok) throw new Error('History fetch failed');
    const data = await response.json(); 
    
    if (!chatMessages) return; // Dobara check karein
    chatMessages.innerHTML = ''; 

    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(msg => {
        displayMessage(msg.text, msg.from); 
      });
    }
    displayOptions(data.options);
  } catch (err) {
    console.error('History Error:', err);
    displayMessage('Oops! History load nahi ho saki.', 'bot');
  }
}

// 6. Chat Shuru Karein (GLOBAL)
async function initializeChat() {
  const token = localStorage.getItem('authToken'); // Token check karein
  if (!token) {
     displayMessage('नमस्ते! बातचीत शुरू करने के लिए कृपया लॉग इन करें।', 'bot');
     return;
  }
  await loadChatHistory();
}




// ====== TEAM DATA (API based) ======
async function getTeamData() {
  if (!authToken) return { 1: [], 2: [], 3: [] };
  try {
    const data = await apiRequest("/team", "GET");
    return data.team || { 1: [], 2: [], 3: [] };
  } catch (err) {
    console.error("Team fetch failed:", err);
    return { 1: [], 2: [], 3: [] };
  }
}

async function switchLevel(level) {
  const teamData = await getTeamData();

  document.getElementById("levelTitle").innerText = level;
  document.querySelectorAll('.level-tabs button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.level-tabs button')[level - 1].classList.add('active');

  const list = document.getElementById("userList");
  list.innerHTML = "";
  const users = teamData[level];
  if (!users || users.length === 0) {
    list.innerHTML = `<div class="no-data">NO DATA</div>`;
    document.getElementById("teamRecharge").innerText = 0;
    document.getElementById("teamSize").innerText = 0;
    return;
  }

  let totalRecharge = 0;
  users.forEach(user => {
    totalRecharge += user.recharge || 0;
    const div = document.createElement("div");
    div.className = "user-card";
    div.innerHTML = `
      <div class="user-card-row">
        <div class="left-part">
          <img src="/Screenshot_2025-07-15-22-15-43-052_com.google.android.googlequicksearchbox.png" class="user-img">
          <div class="user-id"><b>${user.id}</b></div>
        </div>
        <div class="right-part">
          <p>Recharge: ₹${user.recharge || 0}</p>
          <p>Withdraw: ₹${user.withdraw || 0}</p>
          <br>
          <p>Time: ${user.time || ""}</p>
        </div>
      </div>`;
    list.appendChild(div);
  });

  document.getElementById("teamRecharge").innerText = totalRecharge;
  document.getElementById("teamSize").innerText = users.length;
}

// ====== INCOME DETAILS ======
async function updateIncomeDetails() {
  if (!authToken) return;
  try {
    const data = await apiRequest("/income", "GET"); // backend aggregates commission
    const { lv1, lv2, lv3, total } = data;

    document.getElementById("commission1").innerText = lv1.toFixed(2);
    document.getElementById("commission2").innerText = lv2.toFixed(2);
    document.getElementById("commission3").innerText = lv3.toFixed(2);
    document.getElementById("totalCommission").innerText = total.toFixed(2);
  } catch (err) {
    console.error("Income details fetch failed:", err);
  }
}

let index = 0;
function autoSlide() {
  index++;
  if (index > 2) index = 0;
  document.getElementById("slider").style.transform = `translateX(-${index * 100}%)`;
}
setInterval(autoSlide, 2300);

function showTemporaryAlert(message, duration) {
  const alertBox = document.createElement("div");
  alertBox.textContent = message;
  alertBox.style.position = "fixed";
  alertBox.style.top = "250px";
  alertBox.style.left = "50%";
  alertBox.style.width = "60%";
  alertBox.style.height = "90px";
  alertBox.style.transform = "translateX(-50%)";
  alertBox.style.background = "rgba(40,40,40,0.95)";
  alertBox.style.color = "#fff";
  alertBox.style.padding = "15px 25px";
  alertBox.style.borderRadius = "10px";
  alertBox.style.zIndex = "9999";
  alertBox.style.fontSize = "19px";
  alertBox.style.textAlign = "center";
  document.body.appendChild(alertBox);

  setTimeout(() => {
    alertBox.remove();
  }, duration || 2000);
}

// ====== INIT ON LOAD ======
document.addEventListener("DOMContentLoaded", () => {
  updateBalanceDisplay();
  updateIncomeDisplay();
  loadWithdrawRecords();
  showTransactions();
  
  // Fir har 2 sec par refresh
  setInterval(() => {
    updateBalanceDisplay();
  updateIncomeDisplay();
  loadWithdrawRecords();
  showTransactions();
  }, 2000);
});

// ====== DISPLAY BALANCE & INCOME (from backend) ======
async function updateBalanceDisplay() {
  if (!authToken) return;
  try {
    const data = await apiRequest("/me", "GET");
    document.getElementById("user-balance").innerText = (data.user.balance || 0).toFixed(2);
  } catch (err) {
    console.error("Balance fetch failed:", err.message);
  }
}

async function updateIncomeDisplay() {
  if (!authToken) return;
  try {
    const data = await apiRequest("/me", "GET");
    const commissionIncome = data.user.userIncome || 0;
    const dailyIncome = data.user.totalIncome || 0;
    const combined = commissionIncome + dailyIncome;
    const el = document.getElementById("user-income");
    if (el) el.textContent = `₹${combined.toFixed(2)}`;
  } catch (err) {
    console.error("Income fetch failed:", err.message);
  }
}

let selectedPlan = null;

// ====== PLAN SELECTION ======
function handleBuyClick(plan) {
  if (!authToken || !currentUser) {
    alert("Please login first.");
    return;
  }

  // ✅ Backend will check balance, here just select plan
  selectedPlan = plan;
  createPlanPopup(); // confirmation popup
}

// ====== CONFIRM PURCHASE ======
async function confirmPurchase() {
  console.log("confirmPurchase called, selectedPlan:", selectedPlan);
  if (!selectedPlan) return;

  if (!authToken) {
    showSuccessToast("ERROR!");
    return;
  }

  try {
    // 🔹 Send plan purchase request to backend
    const data = await apiRequest("/purchase", "POST", { plan: selectedPlan });

    // ✅ UI updates with backend response
    updateBalanceDisplay?.();
    updateVipDisplay?.();
    updateIncomeDisplay?.();
    showTransactions?.();
    if (typeof openMyOrderPage === "function") openMyOrderPage();

    showSuccessToast("success");
  } catch (err) {
    if (err.message.includes("Insufficient")) {
      showTemporaryAlert("Insufficient balance \n\nPlease recharge.", 2000);
      setTimeout(() => {
        openFullPage("rechargePage");
      }, 2000);
    } else {
      alert("Purchase failed: " + err.message);
    }
  }
}
function openPopup() {
createPlanPopup();
}
function createPlanPopup() {
// Agar pehle se bana hua ho to hata do
const existing = document.getElementById("popup");
if (existing) existing.remove();

const popup = document.createElement("div");
popup.id = "popup";
popup.className = "popup";
popup.style.position = "fixed";
popup.style.top = 0;
popup.style.left = 0;
popup.style.width = "100%";
popup.style.height = "100%";
popup.style.background = "rgba(0, 0, 0, 0.5)";
popup.style.display = "flex";
popup.style.justifyContent = "center";
popup.style.alignItems = "center";
popup.style.zIndex = 999;

const popupContent = document.createElement("div");
popupContent.className = "popup-content";
popupContent.style.background = "rgba(100, 100, 100, 0.98)";
popupContent.style.color = "white";
popupContent.style.padding = "30px";
popupContent.style.borderRadius = "10px";
popupContent.style.textAlign = "center";
popupContent.style.boxShadow = "0 5px 15px rgba(0, 0, 0, 0.1)";

const heading = document.createElement("h3");
heading.innerText = "Confirm Plan Purchase";

const message = document.createElement("p");
message.innerText = "Do you want to buy this plan?";

const buttonWrapper = document.createElement("div");
buttonWrapper.className = "popup-buttons";
buttonWrapper.style.marginTop = "15px";

const cancelBtn = document.createElement("button");
cancelBtn.innerText = "Cancel";
cancelBtn.style.margin = "8px";
cancelBtn.style.padding = "13px 29px";
cancelBtn.style.fontWeight = "bold";
cancelBtn.style.border = "none";
cancelBtn.style.borderRadius = "8px";
cancelBtn.style.background = "#ccc";
cancelBtn.onclick = () => popup.remove();

const confirmBtn = document.createElement("button");
confirmBtn.innerText = "Confirm";
confirmBtn.style.margin = "8px";
confirmBtn.style.padding = "13px 29px";
confirmBtn.style.fontWeight = "bold";
confirmBtn.style.border = "none";
confirmBtn.style.borderRadius = "8px";
confirmBtn.style.background = "#800000";
confirmBtn.style.color = "white";
confirmBtn.onclick = () => {
confirmPurchase();
popup.remove();
};

buttonWrapper.appendChild(cancelBtn);
buttonWrapper.appendChild(confirmBtn);

popupContent.appendChild(heading);
popupContent.appendChild(message);
popupContent.appendChild(buttonWrapper);

popup.appendChild(popupContent);
document.body.appendChild(popup);
}

// ====== MY ORDERS ======
async function openMyOrderPage() {
  if (!authToken) {
    document.getElementById("orderCard").innerHTML = "<p>Please login.</p>";
    return;
  }

  const container = document.getElementById("orderCard");

  try {
    // 🔹 Fetch user orders from backend
    const data = await apiRequest("/orders", "GET");

    const plans = data.orders || [];

    if (plans.length === 0) {
      container.innerHTML = "<p>No orders found.</p>";
    } else {
      container.innerHTML = "";
      plans.forEach((plan) => {
        const now = Date.now();
        const daysPassed = Math.floor((now - plan.time) / (1000 * 60 * 60 * 24));
        const isFinished = daysPassed >= plan.cycle;

        const card = document.createElement("div");
        card.className = "order-card";
        card.style.display = "flex";
        card.style.gap = "10px";
        card.style.alignItems = "center";
        card.style.padding = "10px";

        const img = document.createElement("img");
        img.src = plan.image;
        img.alt = "Plan Image";
        img.style.width = "100px";
        img.style.height = "100px";

        const info = document.createElement("div");
        info.style.fontSize = "18px";
        info.style.marginLeft = "34px";

        const statusP = document.createElement("p");
        statusP.style.margin = "2px 0 15px 0";
        statusP.style.fontSize = "18px";
        statusP.style.textAlign = "right";
        statusP.style.color = isFinished ? "red" : "green";
        statusP.textContent = isFinished ? "Finished" : "Active";

        const title = document.createElement("h3");
        title.style.color = "brown";
        title.style.textAlign = "left";
        title.style.margin = "0 0 10px 0";
        title.textContent = plan.planName;

        const price = document.createElement("p");
        price.style.margin = "2px 0";
        price.style.color = "black";
        price.style.textAlign = "left";
        price.textContent = `Price: ₹${plan.price}`;

        const cycle = document.createElement("p");
        cycle.style.margin = "2px 0";
        cycle.style.color = "black";
        cycle.style.textAlign = "left";
        cycle.textContent = `Cycle: ${plan.cycle}`;

        const daily = document.createElement("p");
        daily.style.margin = "2px 0";
        daily.style.color = "black";
        daily.style.textAlign = "left";
        daily.textContent = `Daily: ₹${plan.daily}`;

        const date = document.createElement("p");
        date.style.margin = "2px 0";
        date.style.fontSize = "13px";
        date.style.color = "black";
        date.style.textAlign = "right";
        date.textContent = `Date: ${new Date(plan.time).toLocaleString()}`;

        info.append(statusP, title, price, cycle, daily, date);
        card.append(img, info);
        container.appendChild(card);
        container.appendChild(document.createElement("hr"));
      });
    }

    const devices = document.getElementById("openDevicesPage");
    if (devices) devices.style.display = "block";
  } catch (err) {
    container.innerHTML = "<p>Failed to load orders.</p>";
    console.error("Orders fetch failed:", err);
  }
}

// ====== DAILY INCOME (API based) ======
async function creditDailyIncome() {
  if (!authToken) return;

  try {
    // 🔹 Ask backend to credit income (backend will check which plans are due)
    const data = await apiRequest("/credit-income", "POST");

    // ✅ Update UI with new totals
    updateIncomeDisplay?.();
    showTransactions?.();

    if (data.creditedDays > 0) {
      console.log(`Credited ${data.creditedDays} days of income`);
    }
  } catch (err) {
    console.error("Daily income credit failed:", err);
  }
}
// ====== VIP DISPLAY ======
async function updateVipDisplay() {
  if (!authToken) return;
  try {
    const data = await apiRequest("/me", "GET"); // backend se profile
    const lvl = data.user.vipLevel || 0;
    const el = document.getElementById("VIPsec");
    if (el) {
      if (lvl > 0) {
        el.textContent = `VIP ${lvl}`;
      } else {
        el.textContent = "VIP 0";
      }
    }
  } catch (err) {
    console.error("VIP fetch failed:", err.message);
  }
}

// ====== TRANSACTION HELPERS ======
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", { 
    style: "currency", 
    currency: "INR", 
    maximumFractionDigits: 2 
  }).format(amount);
}

function formatDate(raw) {
  const d = new Date(raw);
  if (isNaN(d)) return raw || "";
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true
  });
}

function sanitize(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ====== TRANSACTIONS DISPLAY ======
async function showTransactions() {
  if (!authToken) return;
  const container = document.getElementById("transactionList");
  if (!container) return;

  try {
    // 🔹 Fetch transactions from backend
    const data = await apiRequest("/transactions", "GET");
    const txs = Array.isArray(data.transactions)
      ? [...data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date))
      : [];

    if (txs.length === 0) {
      container.innerHTML = `<div class="transaction-card"><p style="margin:0;">No transactions found.</p></div>`;
      return;
    }

    container.innerHTML = txs.map(tx => {
      let typeClass = "other";
      let badgeText = tx.type || "Unknown";

      if (/recharge/i.test(tx.type) || /credit/i.test(tx.type) || /approved/i.test(tx.detail || "")) {
  typeClass = "recharge";   // 🔹 Recharge wali styling milegi
  badgeText = "Recharge";
      } else if (/daily income/i.test(tx.type) || tx.type.toLowerCase().includes("daily")) {
        typeClass = "daily-income";
        badgeText = "Daily Income";
      } else if (/commission/i.test(tx.type)) {
        typeClass = "commission";
        badgeText = tx.type; 
      } else if (/purchase/i.test(tx.type)) {
        typeClass = "purchase";
        badgeText = "Plan Purchase";
      }

      const levelClass = (/Level\s*1/i.test(tx.type) ? "level1" :
                          /Level\s*2/i.test(tx.type) ? "level2" :
                          /Level\s*3/i.test(tx.type) ? "level3" : "");

      const amount = typeof tx.amount === "number" ? tx.amount : parseFloat(tx.amount) || 0;
      const dateStr = formatDate(tx.date);

      const detailHtml = tx.detail 
        ? `<div class="transaction-detail" style="margin-top:4px; font-size:0.8em; color:#555;">${sanitize(tx.detail)}</div>` 
        : "";

      let sign = "";
      if (/purchase/i.test(tx.type)) sign = "-";
      const displayAmount = `${sign}${formatCurrency(Math.abs(amount))}`;

      return `
        <div class="transaction-card ${typeClass} ${levelClass}">
          <div style="flex:1; min-width:150px;">
            <p class="transaction-type" style="margin:0; display:flex; align-items:center; gap:8px;">
              <span class="badge">${badgeText}</span>
              <span class="transaction-amount ${tx.color}">${displayAmount}</span>
            </p>
            <p class="transaction-meta" style="margin:4px 0 0;">on ${dateStr}</p>
            ${detailHtml}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Transactions fetch failed:", err);
    container.innerHTML = `<div class="transaction-card"><p style="margin:0;">Error loading transactions</p></div>`;
  }
}

// ====== INIT ON LOAD ======
document.addEventListener("DOMContentLoaded", () => {
  updateBalanceDisplay();
  updateVipDisplay();
  showTransactions();
});
// ====== PENDING DAILY INCOME (API based) ======
async function getPendingDailyIncome() {
  if (!authToken) return [];

  try {
    // 🔹 Ask backend to calculate pending daily income
    const data = await apiRequest("/pending-income", "GET");

    // Response expected like:
    // { pending: [{ planName, creditableDays, amount }, ...] }
    return data.pending || [];
  } catch (err) {
    console.error("Failed to fetch pending income:", err.message);
    return [];
  }
}
// script.js (sabse baahar, DOMContentLoaded ke andar nahi)

// Timer ke liye ek global variable
let toastTimer;

/**
 * Professional popup dikhaane ke liye function
 * @param {string} message - Jo message aap dikhana chahte hain
 */
function showSuccessToast(message = "Success") {
  
  const toast = document.getElementById("toastPopup");
  const toastText = document.getElementById("toastText");
  if (!toast || !toastText) return; // Agar HTML nahi mila toh

  // 1. Naya message set karein
  toastText.innerText = message;

  // 2. Agar pehle se koi timer chal raha hai, toh use clear karein
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  // 3. Popup ko dikhaayein (fade-in)
  toast.classList.add("show");

  // 4. User ke request ke mutabik 1 second (1000ms) baad ise hide (fade-out) karein
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toastTimer = null; // Timer ko reset karein
  }, 1000); // 1 second
}
