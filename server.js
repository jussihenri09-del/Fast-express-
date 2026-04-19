/**
 * FAST EXPRESS COURIER — Backend Server
 * Stack: Node.js + Express + better-sqlite3
 * Run: npm install && node server.js
 * Admin: http://localhost:3000/admin  (admin / fastexpress2025)
 */

const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fastexpress_secret_change_in_production_2025';

// ── DB SETUP ──────────────────────────────────────────────
const db = new Database('fastexpress.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'client',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    tracking_number TEXT UNIQUE NOT NULL,
    sender_name TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    sender_phone TEXT,
    receiver_name TEXT NOT NULL,
    receiver_address TEXT NOT NULL,
    receiver_phone TEXT,
    receiver_email TEXT,
    description TEXT,
    weight REAL DEFAULT 1.0,
    service_type TEXT DEFAULT 'standard',
    status TEXT DEFAULT 'pending',
    estimated_delivery TEXT,
    price REAL DEFAULT 0,
    notes TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tracking_events (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@fastexpress.com');
if (!adminExists) {
  const hash = bcrypt.hashSync('fastexpress2025', 10);
  db.prepare('INSERT INTO users (id, name, email, phone, password, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), 'Admin User', 'admin@fastexpress.com', '07059137221', hash, 'admin');
  console.log('✅ Admin user created: admin@fastexpress.com / fastexpress2025');
}

// Seed demo shipments if none exist
const shipCount = db.prepare('SELECT COUNT(*) as c FROM shipments').get();
if (shipCount.c === 0) {
  const demoShipments = [
    {
      id: uuidv4(), tracking: 'FX-2025-001847', sender: 'John Adeyemi', sAddr: '12 Lagos Street, Ikeja, Lagos',
      sPhone: '08012345678', receiver: 'Amara Okonkwo', rAddr: '45 Port Harcourt Road, PH', rPhone: '08087654321',
      rEmail: 'amara@email.com', desc: 'Electronics - Laptop', weight: 2.5, service: 'express',
      status: 'in_transit', delivery: '2025-07-18', price: 9500, notes: 'Handle with care'
    },
    {
      id: uuidv4(), tracking: 'FX-2025-002391', sender: 'Chioma Eze', sAddr: '7 Enugu Ave, GRA, Enugu',
      sPhone: '08055667788', receiver: 'Tunde Bakare', rAddr: '88 Broad Street, Victoria Island, Lagos', rPhone: '08099887766',
      rEmail: 'tunde@email.com', desc: 'Documents & Files', weight: 0.5, service: 'same_day',
      status: 'out_for_delivery', delivery: '2025-07-15', price: 4200, notes: 'Urgent legal documents'
    },
    {
      id: uuidv4(), tracking: 'FX-2025-003102', sender: 'Emeka Nwosu', sAddr: '3 Onitsha Market Road, Onitsha',
      sPhone: '08034455667', receiver: 'Fatima Aliyu', rAddr: '21 Shehu Shagari Way, Abuja', rPhone: '08077889900',
      rEmail: 'fatima@email.com', desc: 'Fashion items - 3 parcels', weight: 8.0, service: 'standard',
      status: 'delivered', delivery: '2025-07-10', price: 6800, notes: ''
    }
  ];

  const insertShip = db.prepare(`INSERT INTO shipments 
    (id, tracking_number, sender_name, sender_address, sender_phone, receiver_name, receiver_address, receiver_phone, receiver_email, description, weight, service_type, status, estimated_delivery, price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const insertEvent = db.prepare(`INSERT INTO tracking_events (id, shipment_id, status, location, description, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);

  for (const s of demoShipments) {
    insertShip.run(s.id, s.tracking, s.sender, s.sAddr, s.sPhone, s.receiver, s.rAddr, s.rPhone, s.rEmail, s.desc, s.weight, s.service, s.status, s.delivery, s.price, s.notes);

    const events = [
      { status: 'collected', location: s.sAddr, desc: 'Package collected from sender', ts: '2025-07-14 09:00:00' },
      { status: 'processing', location: 'Fast Express Sorting Hub — Lagos', desc: 'Package scanned and sorted at hub', ts: '2025-07-14 14:30:00' },
      { status: 'in_transit', location: 'En Route to Destination City', desc: 'Package loaded onto delivery vehicle', ts: '2025-07-15 07:00:00' },
    ];
    if (s.status === 'out_for_delivery' || s.status === 'delivered') {
      events.push({ status: 'out_for_delivery', location: s.rAddr, desc: 'Driver out for delivery', ts: '2025-07-15 10:00:00' });
    }
    if (s.status === 'delivered') {
      events.push({ status: 'delivered', location: s.rAddr, desc: 'Package delivered successfully', ts: '2025-07-15 14:22:00' });
    }
    for (const ev of events) {
      insertEvent.run(uuidv4(), s.id, ev.status, ev.location, ev.desc, ev.ts);
    }
  }
  console.log('✅ Demo shipments seeded');
}

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

// ── AUTH ROUTES ───────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, email, phone, password) VALUES (?, ?, ?, ?, ?)').run(id, name, email, phone || '', hash);

  const token = jwt.sign({ id, name, email, role: 'client' }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: { id, name, email, role: 'client' }, token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ── PUBLIC TRACKING ───────────────────────────────────────
app.get('/api/track/:trackingNumber', (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE tracking_number = ?').get(req.params.trackingNumber.toUpperCase());
  if (!shipment) return res.status(404).json({ error: 'Tracking number not found' });

  const events = db.prepare('SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp ASC').all(shipment.id);

  // Mask personal details for public tracking
  const safe = {
    tracking_number: shipment.tracking_number,
    status: shipment.status,
    service_type: shipment.service_type,
    description: shipment.description,
    weight: shipment.weight,
    estimated_delivery: shipment.estimated_delivery,
    sender_city: shipment.sender_address.split(',').slice(-2).join(',').trim(),
    receiver_city: shipment.receiver_address.split(',').slice(-2).join(',').trim(),
    receiver_name: shipment.receiver_name.split(' ')[0] + ' ' + (shipment.receiver_name.split(' ')[1]?.[0] || '') + '.',
    created_at: shipment.created_at,
    events
  };
  res.json(safe);
});

// ── CONTACT ───────────────────────────────────────────────
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });
  db.prepare('INSERT INTO contacts (id, name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), name, email, phone || '', subject || '', message);
  res.json({ success: true, message: 'Message received! We\'ll contact you within 24 hours.' });
});

// ── CLIENT ROUTES ─────────────────────────────────────────
app.get('/api/shipments/my', authMiddleware, (req, res) => {
  const shipments = db.prepare('SELECT * FROM shipments WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(shipments);
});

// ── ADMIN ROUTES ──────────────────────────────────────────
app.get('/api/admin/shipments', adminMiddleware, (req, res) => {
  const { status, search, page = 1 } = req.query;
  let query = 'SELECT * FROM shipments WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (search) { query += ' AND (tracking_number LIKE ? OR sender_name LIKE ? OR receiver_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC LIMIT 20 OFFSET ?';
  params.push((parseInt(page) - 1) * 20);
  res.json(db.prepare(query).all(...params));
});

app.post('/api/admin/shipments', adminMiddleware, (req, res) => {
  const { sender_name, sender_address, sender_phone, receiver_name, receiver_address, receiver_phone, receiver_email, description, weight, service_type, estimated_delivery, price, notes } = req.body;
  if (!sender_name || !receiver_name || !sender_address || !receiver_address) return res.status(400).json({ error: 'Missing required fields' });

  const id = uuidv4();
  const year = new Date().getFullYear();
  const seq = String(db.prepare('SELECT COUNT(*) as c FROM shipments').get().c + 1).padStart(6, '0');
  const tracking_number = `FX-${year}-${seq}`;

  db.prepare(`INSERT INTO shipments (id, tracking_number, sender_name, sender_address, sender_phone, receiver_name, receiver_address, receiver_phone, receiver_email, description, weight, service_type, status, estimated_delivery, price, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, tracking_number, sender_name, sender_address, sender_phone || '', receiver_name, receiver_address, receiver_phone || '', receiver_email || '', description || '', parseFloat(weight) || 1, service_type || 'standard', estimated_delivery || '', parseFloat(price) || 0, notes || '');

  db.prepare('INSERT INTO tracking_events (id, shipment_id, status, location, description) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, 'pending', sender_address, 'Shipment created and awaiting collection');

  res.json({ success: true, tracking_number, id });
});

app.put('/api/admin/shipments/:id/status', adminMiddleware, (req, res) => {
  const { status, location, description } = req.body;
  const validStatuses = ['pending', 'collected', 'processing', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  db.prepare('UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  db.prepare('INSERT INTO tracking_events (id, shipment_id, status, location, description) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, status, location || 'Fast Express Hub', description || `Status updated to ${status}`);

  res.json({ success: true });
});

app.delete('/api/admin/shipments/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM tracking_events WHERE shipment_id = ?').run(req.params.id);
  db.prepare('DELETE FROM shipments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM shipments').get().c;
  const delivered = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'delivered'").get().c;
  const in_transit = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status IN ('in_transit','out_for_delivery','collected','processing')").get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM shipments WHERE status = 'pending'").get().c;
  const revenue = db.prepare("SELECT SUM(price) as s FROM shipments").get().s || 0;
  const contacts = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE read = 0").get().c;
  res.json({ total, delivered, in_transit, pending, revenue, unread_contacts: contacts });
});

app.get('/api/admin/contacts', adminMiddleware, (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  db.prepare('UPDATE contacts SET read = 1').run();
  res.json(contacts);
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
  res.json(db.prepare("SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC").all());
});

// ── SPA FALLBACK ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚚 Fast Express Server running at http://localhost:${PORT}`);
  console.log(`📦 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin Login: admin@fastexpress.com / fastexpress2025`);
  console.log(`📞 Support: 07059137221 | jussihenri09@gmail.com\n`);
});
