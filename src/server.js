require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Set JWT_SECRET in .env to a random string at least 32 characters long.");
  process.exit(1);
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PHONE) {
  console.error("Set ADMIN_EMAIL and ADMIN_PHONE in .env.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false }));

const db = new Database(path.join(__dirname, "../accountix.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, price TEXT NOT NULL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, price TEXT DEFAULT 'Free', premium INTEGER DEFAULT 0, video_url TEXT DEFAULT '', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, item_id INTEGER, details TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT NOT NULL, comment TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, visitor_key TEXT NOT NULL, UNIQUE(course_id, visitor_key));
CREATE TABLE IF NOT EXISTS otp (id INTEGER PRIMARY KEY, email_code_hash TEXT, phone_code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0);
`);
const seedServices = [
 ["GST Registration", "Guidance and assistance for eligible GST registration applications. Final eligibility and filing handled subject to applicable rules.", "Contact for price"],
 ["Bookkeeping", "Monthly bookkeeping, ledger maintenance and transaction categorization.", "From ₹1,000/month"],
 ["Small Business Accounting", "Basic accounting records, expense tracking and financial summaries.", "Contact for price"],
 ["Income Tax Return Assistance", "Tax-document preparation support; regulated filing/representation only through eligible professionals.", "Contact for price"],
 ["Excel Accounting Reports", "Customized Excel bookkeeping sheets and reports.", "From ₹499"]
];
const seedCourses = [
 ["Accounting Basics", "Debit, credit, journal entries, ledger and trial balance.", "Free", 0, ""],
 ["Tally Prime Fundamentals", "Introductory lessons and practical accounting examples.", "Free", 0, ""],
 ["Excel for Accountants", "Excel formulas, bookkeeping templates and reports.", "Free", 0, ""],
 ["GST Basics", "Educational overview of GST concepts and invoices.", "Free", 0, ""]
];
if (db.prepare("SELECT COUNT(*) n FROM services").get().n === 0) {
  const insert = db.prepare("INSERT INTO services(title,description,price) VALUES(?,?,?)");
  seedServices.forEach(x => insert.run(...x));
}
if (db.prepare("SELECT COUNT(*) n FROM courses").get().n === 0) {
  const insert = db.prepare("INSERT INTO courses(title,description,price,premium,video_url) VALUES(?,?,?,?,?)");
  seedCourses.forEach(x => insert.run(...x));
}
function setting(key, fallback="") {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
}
function hash(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function sendMail(to, subject, text) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error("SMTP not configured");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
}
async function sendSms(to, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) throw new Error("Twilio SMS not configured");
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER, to });
}
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin" || payload.email !== process.env.ADMIN_EMAIL.toLowerCase()) throw new Error("bad role");
    req.admin = payload; next();
  } catch { res.status(401).json({ error: "Admin login required" }); }
}
function event(kind, item_id=null, details="") {
  db.prepare("INSERT INTO events(kind,item_id,details) VALUES(?,?,?)").run(kind, item_id, String(details).slice(0,500));
}

app.get("/api/public", (req,res) => {
  res.json({
    services: db.prepare("SELECT id,title,description FROM services WHERE active=1 ORDER BY id").all(),
    courses: db.prepare("SELECT id,title,description,video_url FROM courses WHERE active=1 ORDER BY id").all(),
    whatsapp: String(process.env.WHATSAPP_NUMBER || "").replace(/\D/g, ""),
    adsense: setting("adsense_client", process.env.ADSENSE_CLIENT || "")
  });
});
app.post("/api/event", (req,res) => {
  const {kind,item_id,details} = req.body || {};
  if (!["view","like","share","download"].includes(kind)) return res.status(400).json({error:"Invalid event"});
  event(kind, Number(item_id)||null, details||"");
  res.json({ok:true});
});
app.post("/api/comments", (req,res) => {
  const course_id = Number(req.body.course_id);
  const name = String(req.body.name||"Guest").trim().slice(0,60);
  const comment = String(req.body.comment||"").trim().slice(0,1000);
  if (!course_id || !comment) return res.status(400).json({error:"Course and comment required"});
  db.prepare("INSERT INTO comments(course_id,name,comment) VALUES(?,?,?)").run(course_id,name,comment);
  event("comment",course_id);
  res.json({ok:true});
});
app.get("/api/comments/:courseId", (req,res) => {
  res.json(db.prepare("SELECT id,name,comment,created_at FROM comments WHERE course_id=? ORDER BY id DESC LIMIT 50").all(Number(req.params.courseId)));
});
app.post("/api/like", (req,res) => {
  const course_id = Number(req.body.course_id);
  const visitor_key = hash(String(req.body.visitor_key||"").slice(0,100));
  if (!course_id || !req.body.visitor_key) return res.status(400).json({error:"Missing course or visitor key"});
  try { db.prepare("INSERT INTO likes(course_id,visitor_key) VALUES(?,?)").run(course_id,visitor_key); }
  catch {}
  event("like",course_id);
  res.json({count: db.prepare("SELECT COUNT(*) n FROM likes WHERE course_id=?").get(course_id).n});
});

app.post("/api/auth/request-otp", async (req,res) => {
  const email = String(req.body.email||"").trim().toLowerCase();
  const phone = String(req.body.phone||"").trim();
  if (email !== process.env.ADMIN_EMAIL.toLowerCase() || phone !== process.env.ADMIN_PHONE) return res.status(403).json({error:"Admin credentials do not match"});
  const emailCode = String(crypto.randomInt(100000,999999));
  const phoneCode = String(crypto.randomInt(100000,999999));
  db.prepare("DELETE FROM otp").run();
  db.prepare("INSERT INTO otp(email_code_hash,phone_code_hash,expires_at) VALUES(?,?,?)").run(hash(emailCode),hash(phoneCode),Date.now()+5*60*1000);
  try {
    await sendMail(email,"ACCOUNTIX INDIA Admin OTP",`Your admin email OTP is ${emailCode}. Expires in 5 minutes.`);
    await sendSms(phone,`ACCOUNTIX INDIA admin OTP: ${phoneCode}. Expires in 5 minutes.`);
    res.json({ok:true,message:"OTP sent to configured email and phone."});
  } catch (e) {
    db.prepare("DELETE FROM otp").run();
    res.status(503).json({error:"OTP delivery failed. Check SMTP/Twilio configuration in .env."});
  }
});
app.post("/api/auth/verify-otp", (req,res) => {
  const email = String(req.body.email||"").trim().toLowerCase();
  const phone = String(req.body.phone||"").trim();
  const emailCode = String(req.body.emailCode||"");
  const phoneCode = String(req.body.phoneCode||"");
  if (email !== process.env.ADMIN_EMAIL.toLowerCase() || phone !== process.env.ADMIN_PHONE) return res.status(403).json({error:"Admin credentials do not match"});
  const row = db.prepare("SELECT * FROM otp").get();
  if (!row || Date.now() > row.expires_at || row.attempts >= 5) return res.status(401).json({error:"OTP expired or too many attempts"});
  if (hash(emailCode) !== row.email_code_hash || hash(phoneCode) !== row.phone_code_hash) {
    db.prepare("UPDATE otp SET attempts=attempts+1").run();
    return res.status(401).json({error:"Incorrect OTP"});
  }
  db.prepare("DELETE FROM otp").run();
  const token = jwt.sign({role:"admin",email},JWT_SECRET,{expiresIn:"8h"});
  res.json({token});
});

app.get("/api/admin/overview", requireAdmin, (req,res) => {
  const counts = {};
  ["view","like","comment","share","download"].forEach(k => counts[k] = db.prepare("SELECT COUNT(*) n FROM events WHERE kind=?").get(k).n);
  counts.services = db.prepare("SELECT COUNT(*) n FROM services").get().n;
  counts.courses = db.prepare("SELECT COUNT(*) n FROM courses").get().n;
  res.json({counts, recent: db.prepare("SELECT kind,item_id,details,created_at FROM events ORDER BY id DESC LIMIT 100").all()});
});
app.get("/api/admin/services", requireAdmin, (req,res)=>res.json(db.prepare("SELECT * FROM services ORDER BY id").all()));
app.post("/api/admin/services", requireAdmin, (req,res)=>{
  const {id,title,description,active} = req.body;
  if (!String(title||"").trim()) return res.status(400).json({error:"Title required"});
  if (id) db.prepare("UPDATE services SET title=?,description=?,price=?,active=? WHERE id=?").run(String(title).slice(0,150),String(description||"").slice(0,2000),"",active?1:0,Number(id));
  else db.prepare("INSERT INTO services(title,description,price,active) VALUES(?,?,?,?)").run(String(title).slice(0,150),String(description||"").slice(0,2000),"",active===false?0:1);
  res.json({ok:true});
});
app.delete("/api/admin/services/:id", requireAdmin, (req,res)=>{db.prepare("DELETE FROM services WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.get("/api/admin/courses", requireAdmin, (req,res)=>res.json(db.prepare("SELECT * FROM courses ORDER BY id").all()));
app.post("/api/admin/courses", requireAdmin, (req,res)=>{
  const {id,title,description,video_url,active} = req.body;
  if (!String(title||"").trim()) return res.status(400).json({error:"Title required"});
  const vals=[String(title).slice(0,150),String(description||"").slice(0,2000),"Free",0,String(video_url||"").slice(0,1000),active===false?0:1];
  if (id) db.prepare("UPDATE courses SET title=?,description=?,price=?,premium=?,video_url=?,active=? WHERE id=?").run(...vals,Number(id));
  else db.prepare("INSERT INTO courses(title,description,price,premium,video_url,active) VALUES(?,?,?,?,?,?)").run(...vals);
  res.json({ok:true});
});
app.delete("/api/admin/courses/:id", requireAdmin, (req,res)=>{db.prepare("DELETE FROM courses WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.get("/api/admin/settings", requireAdmin, (req,res)=>res.json({adsense_client:setting("adsense_client",process.env.ADSENSE_CLIENT||"")}));
app.post("/api/admin/settings", requireAdmin, (req,res)=>{
  setSetting("adsense_client",String(req.body.adsense_client||"").slice(0,200));
  res.json({ok:true});
});
app.get("/api/admin/comments", requireAdmin, (req,res)=>res.json(db.prepare("SELECT * FROM comments ORDER BY id DESC LIMIT 200").all()));
app.delete("/api/admin/comments/:id", requireAdmin, (req,res)=>{db.prepare("DELETE FROM comments WHERE id=?").run(Number(req.params.id));res.json({ok:true});});

app.get("/admin", (req,res)=>res.sendFile(path.join(__dirname,"../public/admin.html")));
app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"../public/index.html")));
app.listen(PORT,()=>console.log(`ACCOUNTIX INDIA running at http://localhost:${PORT}`));
