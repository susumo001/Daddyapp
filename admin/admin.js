


let adminToken = localStorage.getItem("adminToken") || "";

// ✅ Login function
async function adminLogin() {
  const username = document.getElementById("adminUsername").value;
  const password = document.getElementById("adminPassword").value;

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (data.token) {
    // 1️⃣ Token save
    localStorage.setItem("adminToken", data.token);

    // 2️⃣ Login page hide + Dashboard show
    document.getElementById("adminLoginBox").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";

    // 3️⃣ Load recharges list
    loadRecharges();
  } else {
    alert(data.error || "Login failed");
  }
}

// ✅  tab switch
function showTab(tabId, btn) {
  // Hide all tabs
  document.querySelectorAll(".tab-content").forEach(tab => {
    tab.style.display = "none";
  });



  // Show selected tab
  document.getElementById(tabId).style.display = "block";
  btn.classList.add("active");

  // Load data according to tab
  if (tabId === "rechargeTab") {
    loadRecharges();
  } else if (tabId === "withdrawTab") {
    loadWithdrawRequests();
  }
}

// ✅ Default call: Recharge tab load hote hi
document.addEventListener("DOMContentLoaded", () => {
  loadRecharges();
  loadWithdrawRequests();
  
    // Fir har 2 sec par refresh
  setInterval(() => {
    loadRecharges();
  loadWithdrawRequests();
  }, 2000);
});


// Admin.js

// ✅ Load Pending Recharges (Table Format)
async function loadRecharges(){
  try {
    const res = await fetch("/api/admin/recharges", {
      headers: { "Authorization": "Bearer " + adminToken }
    });

    const data = await res.json(); // data mein ab { recharges: [], totalConfirmedAmount: 5000 } jaisa response aayega
    if(!res.ok){ alert(data.error || "Error loading"); return; }

    
    // ✅ YEH NAYI LINE ADD KAREIN
    // Total ko turant update karein
    document.getElementById("total-Amont").innerHTML = `Total ₹ ${data.totalConfirmedAmount || 0}`;

    
    const tbody = document.getElementById("rechargeTableBody");
    tbody.innerHTML = "";

    if(!data.recharges || !data.recharges.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" style="text-align:center;">No recharge requests found</td>`;
      tbody.appendChild(tr);
      return;
    }

    data.recharges.forEach(r => {
      // Baaki sab waisa hi rahega
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.userPhone || "N/A"}</td>
        <td>₹${r.amount}</td>
        <td>${r.selectedUPI || "N/A"}</td>
        <td>${r.utr || "Not submitted"}</td>
        <td>${r._id}</td>
        <td>${r.status || "Pending"}</td>
        <td>
          <button onclick="confirmRecharge('${r._id}')">Confirm</button>
          <button onclick="rejectRecharge('${r._id}')">Reject</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch(err){
    console.error("Load recharges error:", err);
    alert("Something went wrong!");
  }
}




    async function updateRecharge(id, status) {
      try {
        const res = await fetch(`/api/admin/recharge/${id}/${status}`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') }
        });
        const data = await res.json();
        if (res.ok) {
          alert("Recharge " + status);
          loadRecharges(); // refresh table
        } else {
          alert(data.error || "Failed to update");
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
    }

    // load when page opens
    loadRecharges();
  
// ✅ Confirm Recharge
async function confirmRecharge(id){
  showQuickPopup("Processing...");

  try {
    const res = await fetch(`/api/admin/recharges/${id}/confirm`, {
      method: "POST",
      headers: { "Authorization":"Bearer " + adminToken }
    });

    const data = await res.json();
    if(!res.ok){ alert(data.error || "Failed to confirm"); return; }

    
    loadRecharges();
    
  } catch(err){
    console.error("Confirm error:", err);
    alert("Something went wrong!");
    
  }
}

// ✅ Reject Recharge
async function rejectRecharge(id){

  showQuickPopup("Processing...");
  try {
    const res = await fetch(`/api/admin/recharges/${id}/reject`, {
      method: "POST",
      headers: { "Authorization":"Bearer " + adminToken }
    });

    const data = await res.json();
    if(!res.ok){ alert(data.error || "Failed to reject"); return; }
     
    loadRecharges();
  } catch(err){
    console.error("Reject error:", err);
    alert("Something went wrong!");
  }
}

// admin.js

// ✅ Load Withdraw Requests (Admin) (MODIFIED)
async function loadWithdrawRequests() {
  try {
    const res = await fetch("/api/admin/withdraws", {
      headers: { "Authorization": "Bearer " + adminToken }
    });
    const data = await res.json();
    // data mein ab { withdraws: [...], totalConfirmed: 1234.56 } jaisa response aayega

    // ✅ NAYI LINE: Total Confirmed amount ko update karein
    document.getElementById("totalWithdraw-Amont").innerHTML = `Total ₹ ${data.totalConfirmed.toFixed(2) || 0}`;

    const tbody = document.getElementById("withdrawTableBody");
    tbody.innerHTML = "";

    if (!data.withdraws || data.withdraws.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No withdraw requests</td></tr>`;
      return;
    }

    data.withdraws.forEach(w => {
      const row = document.createElement("tr");
      // Fee amount = (Total Requested - Final Amount)
      const fee = (w.amount - w.finalAmount).toFixed(2); 

      row.innerHTML = `
        <td>${w.userPhone}</td>
        <td>₹${w.amount}</td>
        <td>₹${fee}</td> <td>
          ${w.bankDetails?.realName || "-"}<br>
          ${w.bankDetails?.accountNumber || "-"}<br>
          ${w.bankDetails?.ifsc || "-"}
        </td>
        <td>${w.status}</td>
        <td>
          <button onclick="confirmWithdrawAdmin('${w._id}')">✅ Confirm</button>
          <button onclick="rejectWithdrawAdmin('${w._id}')">❌ Reject</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.log("Withdraw fetch error:", err);
  }
}


document.addEventListener("DOMContentLoaded", loadWithdrawRequests);

// ✅ Confirm Withdraw
async function confirmWithdrawAdmin(id) {
  
  showQuickPopup("Processing...");
  
  try {
    const res = await fetch(`/api/admin/withdraws/${id}/confirm`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken }
    });
    const data = await res.json();

    if (data.success) {
      
      loadWithdrawRequests();
    } else {
      alert(data.error || "Failed to confirm");
    }
  } catch (err) {
    console.error("Confirm withdraw error:", err);
  }
}

// ✅ Reject Withdraw
async function rejectWithdrawAdmin(id) {
  showQuickPopup("Processing...");
  try {
    const res = await fetch(`/api/admin/withdraws/${id}/reject`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken }
    });
    const data = await res.json();

    if (data.success) {
  
      loadWithdrawRequests();
    } else {
      alert(data.error || "Failed to reject");
    }
  } catch (err) {
    console.error("Reject withdraw error:", err);
  }
}
function showQuickPopup(msg) {
  const popup = document.getElementById("quickPopup");
  popup.textContent = msg || "Processing…";

  // Current visible window ke beech calculate karo
  const x = window.scrollX + window.innerWidth / 2;
  const y = window.scrollY + window.innerHeight / 2;

  popup.style.position = "absolute";
  popup.style.left = x + "px";
  popup.style.top = y + "px";
  popup.style.transform = "translate(-50%, -50%)";

  popup.style.display = "block";
  setTimeout(() => {
    popup.style.display = "none";
  }, 700);
}