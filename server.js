// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());



// Config
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const PORT = process.env.PORT || 5000;

// ----------------- Mongoose Models -----------------
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log("MongoDB connected"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const TransactionSchema = new mongoose.Schema({
  type: String,
  amount: Number,
  date: { type: Date, default: Date.now },
  detail: String,
  from: String,
  color: String
}, { _id: false });

const BoughtPlanSchema = new mongoose.Schema({
  planName: String,
  price: Number,
  daily: Number,
  cycle: Number,
  image: String,
  time: { type: Date, default: Date.now },
  lastIncomeDate: Date,
  daysCredited: { type: Number, default: 0 },
  status: { type: String, default: "Active" }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  refCode: { type: String, unique: true, sparse: true },
  invitedBy: { type: String, default: null }, // phone of inviter
  balance: { type: Number, default: 0 },
  userIncome: { type: Number, default: 0 }, // commissions + credited daily income separated if you want
  totalIncome: { type: Number, default: 0 }, // optional additional field
  vipLevel: { type: Number, default: 0 },
  transactions: { type: [TransactionSchema], default: [] },
  // ✅ Bank details
  bankDetails: {
    realName: String,
    ifsc: String,
    accountNumber: String,
    tradePass: String,
    createdAt: { type: Date, default: Date.now }
  },
  boughtPlans: { type: [BoughtPlanSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

/**
 * TeamData stores invited users grouped by level for a user
 * schema: phone -> levels: {1: [ { id, recharge, withdraw, time } ], 2: [], 3: []}
 */
const TeamDataSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  levels: {
    1: { type: [{ id: String, recharge: Number, withdraw: Number, time: String }], default: [] },
    2: { type: [{ id: String, recharge: Number, withdraw: Number, time: String }], default: [] },
    3: { type: [{ id: String, recharge: Number, withdraw: Number, time: String }], default: [] }
  }
});
const TeamData = mongoose.model('TeamData', TeamDataSchema);

// ✅ Recharge Schema


const RechargeSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userPhone: { type: String, required: true },   // auth से आएगा
  amount: { type: Number, required: true },
  channel: { type: Number, enum: [1, 2], required: true }, // 1 = QR, 2 = Direct
  selectedUPI: { type: String },
  utr: { type: String, index: { unique: true, sparse: true } }, // sparse unique
  status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Recharge = mongoose.model("Recharge", RechargeSchema);

const ServiceMessageSchema = new mongoose.Schema({
  userPhone: { type: String, required: true },
  from:      { type: String, enum: ["user","bot"], required: true },
  text:      { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const ServiceMessage = mongoose.model("ServiceMessage", ServiceMessageSchema);

//✅  withdraw schema
const WithdrawSchema = new mongoose.Schema({
  userPhone: { type: String, required: true },
  amount: { type: Number, required: true },         // requested amount
  finalAmount: { type: Number, required: true }, 
  fee: { type: Number },// after 10% fee
  bankDetails: {
    realName: String,
    accountNumber: String,
    ifsc: String,
  },
  status: { type: String, enum: ["pending", "completed", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

const Withdraw = mongoose.model("Withdraw", WithdrawSchema);

// ✅ Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true } // abhi plain text, later hash karna
});
const Admin = mongoose.model("Admin", adminSchema);



// ----------------- Helpers -----------------
async function generateReferralCode() {
  while (true) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const exists = await User.findOne({ refCode: code }).lean();
    if (!exists) return code;
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function ensureTeamDoc(phone) {
  let doc = await TeamData.findOne({ phone });
  if (!doc) {
    doc = new TeamData({ phone, levels: { 1: [], 2: [], 3: [] } });
    await doc.save();
  }
  return doc;
}

/**
 * Add invitedUser entry to team docs up to levels,
 * called on registration when someone is referred.
 * invitedUser = { id: phone, recharge: 0, withdraw:0, time: new Date().toLocaleString() }
 */
async function addToTeamServer(referrerPhone, level, invitedUser) {
  if (!referrerPhone) return;
  const doc = await ensureTeamDoc(referrerPhone);
  const arr = doc.levels[level] || [];
  arr.push(invitedUser);
  doc.levels[level] = arr;
  await doc.save();
}

// Commission distribution: given rechargeAmount and invitedUserPhone, trace up invitedBy chain and credit userIncome & push transaction.
const COMMISSION_RATES = [0.30, 0.03, 0.02]; // level1,2,3

async function giveInviteCommissionServer(rechargeAmount, invitedUserPhone) {
  const visited = new Set();
  let currentInviterPhone = (await User.findOne({ phone: invitedUserPhone })).invitedBy;
  for (let level = 0; level < COMMISSION_RATES.length; level++) {
    if (!currentInviterPhone || visited.has(currentInviterPhone)) break;
    visited.add(currentInviterPhone);
    const inviter = await User.findOne({ phone: currentInviterPhone });
    if (!inviter) break;

    const commission = rechargeAmount * COMMISSION_RATES[level];

    inviter.userIncome = (inviter.userIncome || 0) + commission;
    inviter.transactions.unshift({
      type: `Level ${level + 1} Commission`,
      amount: commission,
      date: new Date(),
      from: invitedUserPhone,
      color: "green"
    });
    await inviter.save();

    currentInviterPhone = inviter.invitedBy;
  }
}

// Update team recharge counters for up to 3 levels when a user recharges
async function updateTeamRechargeForInvitees(invitedPhone, amount) {
  let currentUserPhone = invitedPhone; // jisne recharge kiya
  let childPhone = invitedPhone;       // jisko update karna hai team me

  for (let level = 1; level <= 3; level++) {
    const currentUser = await User.findOne({ phone: currentUserPhone }).lean();
    if (!currentUser || !currentUser.invitedBy) break;

    const inviterPhone = currentUser.invitedBy;
    const teamDoc = await ensureTeamDoc(inviterPhone);

    const list = teamDoc.levels[level] || [];
    let updated = false;

    for (let item of list) {
      if (item.id === childPhone) {
        item.recharge = (item.recharge || 0) + amount;
        updated = true;
        break;
      }
    }

    if (updated) {
      await teamDoc.save();
    }

    // shift for next loop
    childPhone = currentUserPhone;     // next level ke liye ye child banega
    currentUserPhone = inviterPhone;   // move up in the tree
  }
}

// ----------------- ROUTES -----------------

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { phone, password, referral } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });

    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'This number is already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const refCode = await generateReferralCode();

    // Find inviter phone by referral code (referral is a refCode)
    let invitedByPhone = null;
    if (referral) {
      const refUser = await User.findOne({ refCode: referral });
      if (refUser) invitedByPhone = refUser.phone;
    }

    const newUser = new User({
      phone,
      passwordHash: hashed,
      refCode,
      invitedBy: invitedByPhone,
      balance: 0,
      userIncome: 0,
      totalIncome: 0,
      vipLevel: 0,
      transactions: [],
      boughtPlans: []
    });
    await newUser.save();

    // Add invited entry into team docs for up to 3 levels
    const invitedUser = { id: phone, recharge: 0, withdraw: 0, time: new Date().toLocaleString() };
    if (invitedByPhone) {
      // level1
      await addToTeamServer(invitedByPhone, 1, invitedUser);

      // level2: inviter's inviter
      const inviter = await User.findOne({ phone: invitedByPhone });
      if (inviter && inviter.invitedBy) {
        await addToTeamServer(inviter.invitedBy, 2, invitedUser);

        // level3: inviter's inviter's inviter
        const inviter2 = await User.findOne({ phone: inviter.invitedBy });
        if (inviter2 && inviter2.invitedBy) {
          await addToTeamServer(inviter2.invitedBy, 3, invitedUser);
        }
      }
    }

    return res.json({ message: 'Registered' });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password required' });

    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'No user' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Wrong password' });

    // ensure user has refCode
    if (!user.refCode) {
      user.refCode = await generateReferralCode();
      await user.save();
    }

    const token = signToken({ id: user.phone });

    return res.json({
      token,
      user: {
        phone: user.phone,
        refCode: user.refCode,
        vipLevel: user.vipLevel,
        balance: user.balance,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// server.js mein existing routes ke neeche add karein:

// ✅ Password Change Route
app.post('/api/change-password', authMiddleware, async (req, res) => {
    // authMiddleware se humein req.userId mil jaata hai (jo ki user ka 'phone' hai)
    const userId = req.userId; 
    const { original_password, new_password, tradePass } = req.body;
    
    // 1. Input Validation
    if (!original_password || !new_password) {
        return res.status(400).json({ error: 'Original password and new password are required.' });
    }

    if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    
    try {
        // 2. Database se user ko fetch karein
        const user = await User.findOne({ phone: userId }); 

        if (!user) {
            // Aisi error nahi aani chahiye agar authMiddleware sahi hai
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- ZAROORI UPDATE: Original Password Verification ---
        // 3. User ka diya hua original password, database mein stored HASHED password se compare karein
        const isMatch = await bcrypt.compare(original_password, user.passwordHash); 

        if (!isMatch) {
            // Agar password match nahi karta, toh error dein
            return res.status(401).json({ 
                error: 'Original password is incorrect.' 
            });
        }
        
        // 4. Naye password ko hash karein
        const salt = await bcrypt.genSalt(10); // Salt rounds default 10 use karein
        const newPasswordHash = await bcrypt.hash(new_password, salt);

        // 5. Database mein password update karein
        user.passwordHash = newPasswordHash;
        
        // Agar aap tradePass bhi change kar rahe hain toh yahan logic aayega, par is feature ke liye sirf login password change ho raha hai.
        
        await user.save();

        // 6. Success response
        // Token reset karna optional hai, par security ke liye accha hai.
        // const newToken = signToken({ id: user.phone }); 

        res.status(200).json({ 
            message: 'Login password updated successfully!',
            // token: newToken // Agar aap token refresh karna chahte hain
        });

    } catch (error) {
        console.error('Password Change Error:', error);
        res.status(500).json({ error: 'Server error during password change.' });
    }
});




// Get current user profile (/me)
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Return needed fields
    return res.json({
      user: {
        phone: user.phone,
        refCode: user.refCode,
        invitedBy: user.invitedBy,
        balance: user.balance,
        userIncome: user.userIncome || 0,
        totalIncome: user.totalIncome || 0,
        vipLevel: user.vipLevel || 0
      }
    });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// 🔹 Create Recharge Request
app.post("/api/recharge", authMiddleware, async (req, res) => {
  try {
    const { amount, channel } = req.body;
    if (!amount || !channel) return res.status(400).json({ error: "Amount and channel required" });

    const ch = Number(channel);
    if (![1, 2].includes(ch)) return res.status(400).json({ error: "Invalid channel" });

    // Random UPI select (admin ke list se)
    const adminUPIs = ["lalitroy019@fam", "lalitroy019@fam", "lalitroy019@fam"];
    const selectedUPI = adminUPIs[Math.floor(Math.random() * adminUPIs.length)];

    const orderId = "ORD" + Date.now() + Math.floor(Math.random() * 1000);

    const recharge = new Recharge({
      orderId,
      userPhone: req.userId,  // auth se aaya
      amount,
      channel: ch,
      selectedUPI,
      status: "pending"
    });

    await recharge.save();

    // ✅ yaha UPI intent URL banao
    const upiUrl = `upi://pay?pa=${selectedUPI}&pn=Admin&am=${amount}&cu=INR&tn=Recharge-${orderId}`;

    res.json({ 
      message: "Recharge request created", 
      recharge,
      upiUrl  // frontend ke liye
    });

  } catch (err) {
    console.error("Recharge create error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// POST /api/recharge/submit-utr
app.post('/api/recharge/submit-utr', authMiddleware, async (req, res) => {
  try {
    const { rechargeId, utr } = req.body;
    if (!rechargeId || !utr) return res.status(400).json({ error: 'Recharge ID and UTR required' });

    const cleaned = String(utr).trim();

    // 1) Format: only 12 digits (UPI)
    if (!/^\d{12}$/.test(cleaned)) {
      return res.status(400).json({ error: 'UTR must be 12 digits (UPI)' });
    }

    // 2) Find recharge
    const recharge = await Recharge.findById(rechargeId);
    if (!recharge) return res.status(404).json({ error: 'Recharge order not found' });

    // 3) Check ownership (optional) - ensure user sends UTR for their own order
    if (recharge.userPhone !== req.userId) {
      return res.status(403).json({ error: 'Not allowed for this order' });
    }

    // 4) Check status
    if (recharge.status !== 'pending') {
      return res.status(400).json({ error: 'Recharge already processed' });
    }

    // 5) Optional: time window (10 minutes)
    const createdAt = new Date(recharge.createdAt).getTime();
    if (Date.now() - createdAt > 10 * 60 * 1000) {
      return res.status(400).json({ error: 'Order expired. UTR not accepted' });
    }

    // 6) Duplicate UTR check
    const used = await Recharge.findOne({ utr: cleaned });
    if (used) {
      return res.status(400).json({ error: 'This UTR is already used' });
    }

    // 7) Save UTR (keep status pending for admin verification)
    recharge.utr = cleaned;
    recharge.utrSubmittedAt = new Date();
    await recharge.save();

    return res.json({ message: 'UTR submitted, awaiting admin approval', recharge });
  } catch (err) {
    console.error("Submit UTR error:", err);
    // handle mongoose unique index race-condition gracefully
    if (err.code === 11000 && err.keyPattern && err.keyPattern.utr) {
      return res.status(400).json({ error: 'This UTR is already used' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

// 🔐 Admin Auth Middleware
function adminAuth(req, res, next) {
const authHeader = req.headers["authorization"];
if (!authHeader) return res.status(401).json({ error: "No token" });

const token = authHeader.split(" ")[1];
try {
const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
if (decoded.role !== "admin") {
return res.status(403).json({ error: "Not allowed" });
}
next();
} catch (err) {
return res.status(401).json({ error: "Invalid token" });
}
}




// 🔹 User ke recharge records
app.get("/api/my-recharges", authMiddleware, async (req, res) => {
  try {
    const records = await Recharge.find({ userPhone: req.userId }).sort({ createdAt: -1 });
    res.json({ recharges: records });
  } catch (err) {
    console.error("Fetch records error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// ==========================
// 🔹 ADMIN SIDE
// ==========================

// 🔐 Admin login (env based)
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // ✅ Compare with env values
    if (
      username === process.env.ADMIN_USER &&
      password === process.env.ADMIN_PASS
    ) {
      // Token with role=admin
      const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET || "SECRET_KEY", {
        expiresIn: "45d",
      });

      return res.json({ token });
    }

    return res.status(400).json({ error: "Invalid credentials" });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// ✅ Get Pending Recharges (Admin Dashboard)
app.get("/api/admin/recharges", adminAuth, async (req, res) => {
  try {
    // 1. Pending recharges laayein (jaisa pehle tha)
    const pending = await Recharge.find({ status: "pending" }).sort({ createdAt: -1 });

    // 2. Naya: Confirmed recharges ka total amount calculate karein
    const stats = await Recharge.aggregate([
      { $match: { status: "confirmed" } }, // Sirf confirmed
      { $group: { _id: null, total: { $sum: "$amount" } } } // Unka total
    ]);

    // 3. Total ko variable mein daalein
    const totalConfirmed = (stats.length > 0) ? stats[0].total : 0;

    // 4. Dono cheezein frontend ko bhejein
    res.json({ 
      recharges: pending, 
      totalConfirmedAmount: totalConfirmed // Yeh naya hai
    });

  } catch (err) {
    console.error("Fetch recharges error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// ✅ Confirm Recharge
app.post("/api/admin/recharges/:id/confirm", adminAuth, async (req, res) => {
  try {
    const recharge = await Recharge.findById(req.params.id);
    if (!recharge) return res.status(404).json({ error: "Recharge not found" });

    // user find by phone (not _id)
    const user = await User.findOne({ phone: recharge.userPhone });
    if (!user) return res.status(404).json({ error: "User not found" });

    // update balance
    user.balance += recharge.amount;
    user.transactions.unshift({
      type: "Recharge",
      amount: recharge.amount,
      date: new Date(),
      from: "AdminConfirm",
      color: "green"
    });
    await user.save();

    // update recharge status
    recharge.status = "confirmed";
    await recharge.save();

    // 🔹 Add commission + team updates yaha
    await giveInviteCommissionServer(recharge.amount, recharge.userPhone);
    await updateTeamRechargeForInvitees(recharge.userPhone, recharge.amount);

    res.json({ success: true });
  } catch (err) {
    console.error("Confirm recharge error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Reject Recharge
app.post("/api/admin/recharges/:id/reject", adminAuth, async (req, res) => {
  try {
    const recharge = await Recharge.findById(req.params.id);
    if (!recharge) return res.status(404).json({ error: "Recharge not found" });

    recharge.status = "rejected";
    await recharge.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Reject recharge error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/recharge/confirm", async (req, res) => {
  try {
    const { rechargeId, utr } = req.body;

    const recharge = await Recharge.findById(rechargeId);
    if (!recharge) return res.status(404).json({ error: "Recharge not found" });
    if (recharge.status === "success") {
      return res.status(400).json({ error: "Already confirmed" });
    }

    // 🔹 Update recharge
    recharge.utr = utr;
    recharge.status = "success";
    await recharge.save();

    // 🔹 Update user balance
    const user = await User.findOne({ phone: recharge.userPhone });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.balance += recharge.amount;
    user.transactions.unshift({
      type: "Recharge",
      amount: recharge.amount,
      date: new Date(),
      utr,
      color: "green"
    });
    await user.save();

    // 🔹 Commission + Team Update
    await giveInviteCommissionServer(recharge.amount, recharge.userPhone);
    await updateTeamRechargeForInvitees(recharge.userPhone, recharge.amount);

    return res.json({ success: true, message: "Recharge confirmed" });
  } catch (err) {
    console.error("Recharge confirm error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// ✅ Check Bank (return full details)
app.get("/api/check-bank", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.userId }).lean();
    if (!user) return res.status(404).json({ bound: false });

    if (
      user.bankDetails &&
      user.bankDetails.realName &&
      user.bankDetails.ifsc &&
      user.bankDetails.accountNumber &&
      user.bankDetails.tradePass
    ) {
      // full details bhejo taaki frontend me prefill ho sake
      return res.json({
        bound: true,
        details: {
          realName: user.bankDetails.realName,
          ifsc: user.bankDetails.ifsc,
          accountNumber: user.bankDetails.accountNumber,
          tradePass: user.bankDetails.tradePass, // optional (usually mat bhejo UI pe)
        },
      });
    } else {
      return res.json({ bound: false });
    }
  } catch (err) {
    console.error("Check bank error:", err);
    return res.status(500).json({ bound: false });
  }
});

// ✅ Bind Wallet (save only if not already bound)
app.post("/api/bind-wallet", authMiddleware, async (req, res) => {
  try {
    const { realName, ifsc, accountNumber, tradePass } = req.body;
    if (!realName || !ifsc || !accountNumber || !tradePass) {
      return res.status(400).json({ error: "All fields required" });
    }

    const user = await User.findOne({ phone: req.userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    // ❗️Prevent overwrite if already bound
    if (
      user.bankDetails &&
      user.bankDetails.accountNumber &&
      user.bankDetails.ifsc
    ) {
      return res.status(400).json({ error: "Bank details already bound" });
    }

    user.bankDetails = { realName, ifsc, accountNumber, tradePass };
    await user.save();

    return res.json({ success: true, message: "Wallet bound successfully" });
  } catch (err) {
    console.error("Bind wallet error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/withdraw", authMiddleware, async (req, res) => {
  try {
    const { amount, tradePass } = req.body;
    if (!amount || amount < 200) return res.status(400).json({ error: "Minimum withdraw is ₹200" });

    const user = await User.findOne({ phone: req.userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.bankDetails || !user.bankDetails.accountNumber) {
      return res.status(400).json({ error: "Bind wallet first" });
    }

// ⚡ Plain text check
    if (!user.bankDetails || user.bankDetails.tradePass !== tradePass) {
      return res.status(400).json({ error: "Invalid trade password" });
    }

    if (amount > user.userIncome) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const finalAmount = amount - amount * 0.1; // 10% fee

    // balance cut immediately
    user.userIncome -= amount;
    await user.save();

    // save withdraw record
    const withdraw = new Withdraw({
      userPhone: req.userId,
      amount,
      finalAmount,
      bankDetails: user.bankDetails,
      status: "pending"
    });
    await withdraw.save();

    res.json({ success: true, message: "Withdraw request created", withdraw });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/my-withdraws", authMiddleware, async (req, res) => {
  try {
    const records = await Withdraw.find({ userPhone: req.userId }).sort({ createdAt: -1 });
    res.json({ withdraws: records });
  } catch (err) {
    console.error("Fetch withdraws error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// ✅ fetch all withdraws (MODIFIED)
app.get("/api/admin/withdraws", adminAuth, async (req, res) => {
  try {
    // 1. Pending withdraw requests laayein (jaisa pehle tha)
    const pendingList = await Withdraw.find({ status: "pending" }).sort({ createdAt: -1 });

    // 2. Confirmed withdraws ka total amount calculate karein
    const stats = await Withdraw.aggregate([
      { $match: { status: "completed" } }, // 'completed' status wale withdraws
      { $group: { _id: null, total: { $sum: "$finalAmount" } } } // User ko mila hua finalAmount sum karein
    ]);


    const totalConfirmedFinalAmount = (stats.length > 0) ? stats[0].total : 0;

    // 4. Dono cheezein frontend ko bhejein
    res.json({ 
      withdraws: pendingList, // Pending list
      totalConfirmed: totalConfirmedFinalAmount // Confirmed total
    });
  } catch (err) {
    console.error("Fetch withdraws error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// confirm
app.post("/api/admin/withdraws/:id/confirm", adminAuth, async (req, res) => {
const withdraw = await Withdraw.findById(req.params.id);
if (!withdraw) return res.status(404).json({ error: "Not found" });

withdraw.status = "completed";
await withdraw.save();

// add in user transaction history
const user = await User.findOne({ phone: withdraw.userPhone });
if (user) {
user.transactions.unshift({
type: "Withdraw",
amount: withdraw.amount,
date: new Date(),
color: "red"
});
await user.save();
}

res.json({ success: true });
});

// reject
app.post("/api/admin/withdraws/:id/reject", adminAuth, async (req, res) => {
const withdraw = await Withdraw.findById(req.params.id);
if (!withdraw) return res.status(404).json({ error: "Not found" });

withdraw.status = "rejected";
await withdraw.save();

// refund user balance
const user = await User.findOne({ phone: withdraw.userPhone });
if (user) {
user.userIncome += withdraw.amount;
await user.save();
}

res.json({ success: true });
});



// ===========================================
// === CUSTOMER SERVICE CHAT LOGIC START ===
// ===========================================

// 1. Chat ka Decision Tree (Flow)
const chatFlow = {
  'start': {
    reply: 'Hello! 🙏 How can i help you ?',
    options: [
      { text: '💰 Recharge', keyword: 'recharge_query' },
      { text: '💰 Withdraw', keyword: 'withdraw_query' },
      { text: '🤖Costumer Care', keyword: 'support_agent' }
    ]
  },
  'recharge_query': {
    reply: 'ठीक है, अपने रिचार्ज के बारे में बताएं:',
    options: [
      { text: 'रिचार्ज नहीं मिला', keyword: 'recharge_fail' },
      { text: 'कितना समय लगता है?', keyword: 'recharge_time' },
      { text: '🔙 वापस जाएं', keyword: 'start' }
    ]
  },
  'withdraw_query': {
    reply: 'निकासी (Withdraw) से संबंधित:',
    options: [
      { text: 'Withdraw नहीं मिला ', keyword: 'withdraw_fail' },
      { text: 'status अभी तक pending है',keyword:'pending-status'},
      { text: '🔙 वापस जाएं', keyword: 'start' }
    ]
  },
  'recharge_fail': {
    reply: 'यदी आपका पेमेंट कट गया है। और अभी तक आपके अकाउंट में ऐड नहीं हुआ है? तो 30 मिनट का इंतजार करें। हम आपकी समस्या का जल्दी समाधान करेंगे। हैमें इस असुविधा के लिए खेद है 🙏',
    options: [
      { text: '🧑‍💼 एजेंट से बात करें', keyword: 'support_agent' },
      { text: '🏠 मुख्य मेनू', keyword: 'start' }
    ]
  },
  
   'recharge_time': {
    reply: 'रिचार्ज हम यूजर के अकाउंट में तुरंत ही ऐड कर देते हैं लेकिन कभी-कभी कुछ  गड़बड़ी  के कारण 1 घंटे का टाइम लग सकता है 🙏 🙏',
    options: [
      { text: '🧑‍💼 एजेंट से बात करें', keyword: 'support_agent' },
      { text: '🏠 मुख्य मेनू', keyword: 'start' }
    ]
  },
  
  'support_agent': {
    reply: 'अभी हम एक साथ कई लोगों की मदद करने में व्यस्त हैं कृपया कुछ समय बाद कोशिश करे ... धन्यवाद ',
    options: [
      { text: '🏠 मुख्य मेनू पर जाएं', keyword: 'start' }
    ]
  },
  // Aap yahaan aur bhi keywords add kar sakte hain...
};



// 1. History Route (Yeh pehla "Hello" message banata hai)
app.get('/api/chat/history', authMiddleware, async (req, res) => {
  try {
    const userPhone = req.userId;
    let history = await ServiceMessage.find({ userPhone: userPhone }).sort({ createdAt: 1 });

    if (history.length === 0) {
      // User ki pehli visit hai -> "Hello" message banao aur save karo
      const firstBotMsg = new ServiceMessage({
        userPhone: userPhone,
        from: 'bot',
        text: chatFlow['start'].reply // "Hello! How can i help you?"
      });
      await firstBotMsg.save();
      history.push(firstBotMsg); // Ise array mein daalo
    }

    // Hamesha starting options bhejo
    const startOptions = chatFlow['start'].options;

    // Messages aur Options dono bhejo
    res.json({
      messages: history,
      options: startOptions
    });

  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// 2. Chat Route (Yeh "Hello" ko dobara save nahi karta)
app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { keyword, userText } = req.body;
    const userPhone = req.userId;
    const botResponse = chatFlow[keyword] || chatFlow['start'];

    if (userText) {
      // User ka message save karo
      await new ServiceMessage({ userPhone, from: 'user', text: userText }).save();
    }
    
    // Bot ka reply save karo, LEKIN 'start' (Hello) ko dobara save mat karo
    if (keyword !== 'start') {
      await new ServiceMessage({ userPhone, from: 'bot', text: botResponse.reply }).save();
    }
    
    // Reply bhej do
    res.json(botResponse);

  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// ===========================================
// === CUSTOMER SERVICE CHAT LOGIC END ===
// ===========================================


// Transactions list (final merged version)
app.get('/api/transactions', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId; // JWT se userId set hota hai
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Return transactions (agar na ho to empty array)
    return res.json({ transactions: user.transactions || [] });
  } catch (err) {
    console.error("Transactions error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// Purchase plan
app.post('/api/purchase', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const { plan } = req.body;
    if (!plan || !plan.price) return res.status(400).json({ error: 'Plan info required' });

    const price = Number(plan.price);
    if (isNaN(price) || price <= 0) return res.status(400).json({ error: 'Invalid plan price' });

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if ((user.balance || 0) < price) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct
    user.balance -= price;

    // VIP upgrade if applicable
    if (plan.planName && plan.planName.startsWith("Upgrade VIP")) {
      const vipNum = parseInt(plan.planName.replace("Upgrade VIP", "").trim(), 10);
      if (!isNaN(vipNum) && vipNum > (user.vipLevel || 0)) {
        user.vipLevel = vipNum;
      }
    }

    // Normalize daily/cycle
    const cycleNum = typeof plan.cycle === 'string' ? parseInt(plan.cycle, 10) : (plan.cycle || 0);
    const dailyNum = Number(plan.daily) || 0;

    const now = new Date();
    user.boughtPlans.push({
      planName: plan.planName,
      price: price,
      daily: dailyNum,
      cycle: cycleNum,
      image: plan.image || "",
      time: now,
      lastIncomeDate: now,
      daysCredited: 0,
      status: "Active"
    });

    user.transactions.unshift({
      type: "Plan Purchase",
      amount: price,
      date: new Date(),
      detail: plan.planName,
      color: "red"
    });

    await user.save();

    return res.json({ message: 'Purchase successful', balance: user.balance });
  } catch (err) {
    console.error("Purchase error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// My orders

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let orders = user.boughtPlans || [];

    // ✅ Sort by time (latest first)
    orders = orders.sort((a, b) => new Date(b.time) - new Date(a.time));

    return res.json({ orders });
  } catch (err) {
    console.error("Orders error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});



// Team data
app.get('/api/team', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const doc = await TeamData.findOne({ phone }).lean();
    if (!doc) return res.json({ team: { 1: [], 2: [], 3: [] } });
    return res.json({ team: doc.levels || { 1: [], 2: [], 3: [] } });
  } catch (err) {
    console.error("Team error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Income summary (LV1/LV2/LV3 totals)
app.get('/api/income', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let lv1 = 0, lv2 = 0, lv3 = 0;
    (user.transactions || []).forEach(tx => {
      if (typeof tx.type === 'string') {
        if (tx.type.includes('Level 1')) lv1 += tx.amount || 0;
        else if (tx.type.includes('Level 2')) lv2 += tx.amount || 0;
        else if (tx.type.includes('Level 3')) lv3 += tx.amount || 0;
      }
    });
    const total = lv1 + lv2 + lv3;
    return res.json({ lv1, lv2, lv3, total });
  } catch (err) {
    console.error("Income error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Credit daily income for authenticated user
// Server will compute how many days are due and credit them (similar to frontend logic)
app.post('/api/credit-income', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    const msPerDay = 1000 * 60 * 60 * 24;
    let didCredit = false;
    let totalCreditedDays = 0;
    let totalAmountCredited = 0;

    user.boughtPlans = Array.isArray(user.boughtPlans) ? user.boughtPlans : [];

    for (let plan of user.boughtPlans) {
      if (!plan || typeof plan.cycle !== "number" || plan.cycle <= 0) continue;
      const daily = Number(plan.daily);
      if (isNaN(daily) || daily <= 0) continue;

      const lastIncomeDate = plan.lastIncomeDate ? new Date(plan.lastIncomeDate).getTime() : (new Date(plan.time).getTime());
      const fullDaysSinceLast = Math.floor((now - lastIncomeDate) / msPerDay);
      const alreadyCredited = plan.daysCredited || 0;
      const remainingDays = Math.max(0, plan.cycle - alreadyCredited);
      const creditableDays = Math.min(fullDaysSinceLast, remainingDays);
      if (creditableDays <= 0) continue;

      // Credit day-by-day
      for (let i = 1; i <= creditableDays; i++) {
        const incomeDate = new Date(lastIncomeDate + i * msPerDay);
        user.userIncome = (user.userIncome || 0) + daily;
        user.transactions.unshift({
          type: "Daily Income",
          amount: daily,
          date: incomeDate,
          detail: `Day ${alreadyCredited + i} from plan ${plan.planName || ""}`,
          color: "green"
        });
        totalAmountCredited += daily;
      }

      plan.daysCredited = alreadyCredited + creditableDays;
      plan.lastIncomeDate = new Date(lastIncomeDate + creditableDays * msPerDay);
      totalCreditedDays += creditableDays;
      didCredit = true;
    }

    if (didCredit) {
      await user.save();
    }

    return res.json({ creditedDays: totalCreditedDays, creditedAmount: totalAmountCredited });
  } catch (err) {
    console.error("Credit-income error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Pending income (what would be credited if we run credit)
app.get('/api/pending-income', authMiddleware, async (req, res) => {
  try {
    const phone = req.userId;
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    const msPerDay = 1000 * 60 * 60 * 24;
    const due = [];

    (user.boughtPlans || []).forEach((plan, idx) => {
      if (typeof plan.cycle !== "number" || plan.cycle <= 0) return;
      const daily = Number(plan.daily);
      if (isNaN(daily) || daily <= 0) return;

      const lastIncomeDate = plan.lastIncomeDate ? new Date(plan.lastIncomeDate).getTime() : new Date(plan.time).getTime();
      const fullDaysSinceLast = Math.floor((now - lastIncomeDate) / msPerDay);
      const alreadyCredited = plan.daysCredited || 0;
      const remaining = Math.max(0, plan.cycle - alreadyCredited);
      const creditable = Math.min(fullDaysSinceLast, remaining);
      if (creditable > 0) {
        due.push({
          planIndex: idx,
          planName: plan.planName,
          creditableDays: creditable,
          amount: creditable * daily
        });
      }
    });

    return res.json({ pending: due });
  } catch (err) {
    console.error("Pending-income error:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});





// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

//Serve frontend files

// Public folder serve karna
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Index file serve karna
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});


// Admin folder (capital A because folder is "Admin")
const adminPath = path.join(__dirname, "admin");
app.use("/admin", express.static(adminPath));


// Admin page direct
app.get("/admin", (req, res) => {
  res.sendFile(path.join(adminPath, "admin.html"));
});


// Start server
app.listen(PORT, () => {
  console.log(`✅✅Server running on port ${PORT}`);
});