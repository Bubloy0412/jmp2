require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const db = require('./db');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const Joi = require('joi');

// ensure uploads folder
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, {recursive:true});

// use memory storage so we can process with sharp before saving to disk
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const mim = file.mimetype || '';
  const ext = (file.originalname && path.extname(file.originalname).toLowerCase()) || '';
  const mimOk = mim.includes('jpeg') || mim.includes('png') || mim.includes('jpg');
  const extOk = ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  if (!mimOk && !extOk) return cb(new Error('Only JPEG and PNG images are allowed'));
  cb(null, true);
};

const upload = multer({storage, fileFilter, limits: { fileSize: 200 * 1024 }}); // 200 KB

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }); // 100 requests per 15 minutes per IP
app.use(limiter);

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const csrf = require('csurf');

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.use(csrf({ cookie: true }));

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next){
  if (req.session && req.session.userId) return next();
  return res.status(401).json({error: 'unauthorized'});
}

async function requireAdmin(req, res, next){
  if (!req.session || !req.session.userId) return res.status(401).json({error:'unauthorized'});
  try{
    const u = await db.getUserById(req.session.userId);
    if (!u) return res.status(401).json({error:'unauthorized'});
    if (u.is_admin && Number(u.is_admin) === 1) return next();
    // bootstrap: if there are no admins at all, allow this request so first admin can be created
    try{
      const all = await db.getAllUsers();
      const anyAdmin = all && all.some(x => x.is_admin && Number(x.is_admin) === 1);
      if (!anyAdmin){
        console.log('Bootstrap: no admins exist, allowing admin action for user', u.username);
        return next();
      }
    }catch(e){ /* ignore */ }
    return res.status(403).json({error:'forbidden'});
  }catch(e){ return res.status(500).json({error:'db error'}); }
}

// Auth: register
app.post('/api/register', async (req, res) => {
  const {username, password} = req.body;
  if (!username || !password) return res.status(400).json({error: 'username and password required'});
  const existing = await db.getUserByUsername(username);
  if (existing) return res.status(400).json({error: 'username taken'});
  const hash = await bcrypt.hash(password, 10);
  const user = await db.createUser(username, hash);
  req.session.userId = user.id;
  res.json({id: user.id, username: user.username});
});

// Auth: login
app.post('/api/login', async (req, res) => {
  const {username, password} = req.body;
  if (!username || !password) return res.status(400).json({error: 'username and password required'});
  const user = await db.getUserByUsername(username);
  if (!user) return res.status(400).json({error: 'invalid credentials'});
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({error: 'invalid credentials'});
  req.session.userId = user.id;
  res.json({id: user.id, username: user.username, must_change_password: !!user.must_change_password});
});

// Auth: logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ok:true}));
});

// Return current user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({user: null});
  db.getUserById(req.session.userId).then(u => {
        if (!u) return res.json({user: null});
        res.json({user: {id: u.id, username: u.username, avatar: u.avatar || null, is_admin: !!u.is_admin, must_change_password: !!u.must_change_password}});
  }).catch(e=> res.status(500).json({error:'db error'}));
});

    // change password for current user
    app.post('/api/me/change-password', requireAuth, async (req, res) => {
      const { currentPassword, newPassword } = req.body;
      if (!newPassword) return res.status(400).json({error:'newPassword required'});
      try{
        const u = await db.getUserById(req.session.userId);
        if (!u) return res.status(404).json({error:'user not found'});
        if (currentPassword){
          const ok = await bcrypt.compare(currentPassword, u.password_hash);
          if (!ok) return res.status(400).json({error:'invalid current password'});
        }
      const hash = await bcrypt.hash(newPassword, 10);
      await db.setUserPassword(u.id, hash);
        res.json({ok:true});
      }catch(e){ console.error(e); res.status(500).json({error:'db error'}); }
    });

// get any user public profile
app.get('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  db.getUserById(id).then(u => {
    if (!u) return res.status(404).json({error:'user not found'});
    res.json({id: u.id, username: u.username, avatar: u.avatar || null});
  }).catch(e=> res.status(500).json({error:'db error'}));
});

// set current user's avatar (DataURL) - requires auth
// keep existing DataURL endpoint
app.post('/api/me/avatar', requireAuth, (req, res) => {
  const {dataUrl} = req.body;
  if (!dataUrl) return res.status(400).json({error:'dataUrl required'});
  db.setUserAvatar(req.session.userId, dataUrl).then(u=>{
    if (!u) return res.status(404).json({error:'user not found'});
    res.json({ok:true, avatar: u.avatar});
  }).catch(e=> res.status(500).json({error:'db error'}));
});

// new endpoint: upload avatar file
const sharp = require('sharp');

app.post('/api/me/avatar-file', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, async function(err){
    if (err) return res.status(400).json({error: err.message});
    if (!req.file) return res.status(400).json({error:'file required'});
    try{
      // process image: resize to 256x256, convert to png
      const imgBuffer = await sharp(req.file.buffer).resize(256,256,{fit:'cover'}).png({quality:80}).toBuffer();
      const filename = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.png';
      const outPath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(outPath, imgBuffer);

      // remove previous avatar file if it was stored in uploads
      const user = await db.getUserById(req.session.userId);
      if (user && user.avatar && user.avatar.startsWith('/uploads/')){
        const prev = path.join(__dirname, 'public', user.avatar);
        try{ if (fs.existsSync(prev)) fs.unlinkSync(prev); }catch(e){ /* ignore */ }
      }

      const url = '/uploads/' + filename;
      await db.setUserAvatar(req.session.userId, url);
      res.json({ok:true, avatar: url});
    }catch(e){
      console.error('avatar processing error', e);
      // common sharp/libspng errors indicate invalid image data -> return 400
      const msg = (e && e.message) ? e.message.toLowerCase() : '';
      if (msg.includes('pngload') || msg.includes('input buffer contains an unknown format') || msg.includes('libspng')){
        return res.status(400).json({error: 'Invalid image file'});
      }
      res.status(500).json({error:'processing error'});
    }
  });
});

// new endpoint: upload image for post
app.post('/api/upload-post-image', requireAuth, (req, res) => {
  upload.single('image')(req, res, async function(err){
    if (err) return res.status(400).json({error: err.message});
    if (!req.file) return res.status(400).json({error:'file required'});
    try{
      // process image: resize to max 800x800, keep aspect ratio, convert to jpeg
      const imgBuffer = await sharp(req.file.buffer).resize(800,800,{fit:'inside', withoutEnlargement: true}).jpeg({quality:85}).toBuffer();
      const filename = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.jpg';
      const outPath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(outPath, imgBuffer);

      const url = '/uploads/' + filename;
      res.json({ok:true, imageUrl: url});
    }catch(e){
      console.error('post image processing error', e);
      const msg = (e && e.message) ? e.message.toLowerCase() : '';
      if (msg.includes('pngload') || msg.includes('input buffer contains an unknown format') || msg.includes('libspng') || msg.includes('jpegload') || msg.includes('libjpeg')){
        return res.status(400).json({error: 'Invalid image file'});
      }
      res.status(500).json({error:'processing error'});
    }
  });
});

// API: obtener posts
app.get('/api/posts', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  db.getPosts(limit, offset).then(async posts => {
    const enriched = [];
    for(const p of posts){
      const u = await db.getUserByUsername(p.author);
      enriched.push({...p, author_avatar: u && u.avatar ? u.avatar : null});
    }
    res.json(enriched);
  }).catch(e=> res.status(500).json({error:'db error'}));
});

// Cleanup uploads: remove files in public/uploads not referenced by any user avatar
async function cleanupUploads(){
  try{
    const files = fs.readdirSync(UPLOADS_DIR).filter(f=>f !== '.gitkeep');
    // get avatars referenced in DB
    const users = await db.getAllUsers ? await db.getAllUsers() : null;
    let referenced = [];
    if (users){ referenced = users.map(u => u.avatar).filter(Boolean).map(a=> a.replace(/^\//,'')); }
    // if no db helper, fetch users via getting posts/users table: fallback - scan DB via db.getUserById for ids
    if (!users){
      // best effort: read all files referenced by users by querying incremental ids up to 1000
      const refs = new Set();
      for(let id=1; id<2000; id++){
        try{ const u = await db.getUserById(id); if (!u) continue; if (u.avatar) refs.add(u.avatar.replace(/^\//,'')); }catch(e){break;}
      }
      referenced = Array.from(refs);
    }
    const toDelete = files.filter(f => !referenced.includes(path.join('uploads', f)) && !referenced.includes(f));
    for(const f of toDelete){
      const p = path.join(UPLOADS_DIR, f);
      try{ fs.unlinkSync(p); console.log('deleted upload', f); }catch(e){console.error('delete error', f, e); }
    }
    return {deleted: toDelete};
  }catch(e){ console.error('cleanup error', e); return {error: e.message}; }
}

// manual trigger (requires auth)
app.post('/api/cleanup-uploads', requireAdmin, async (req, res) => {
  const r = await cleanupUploads();
  res.json(r);
});

// health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), time: new Date().toISOString() });
});

// admin: promote a user to admin
app.post('/api/make-admin/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try{
    const u = await db.getUserById(id);
    if (!u) return res.status(404).json({error:'user not found'});
    const updated = await db.makeAdmin(id);
    res.json({ok:true, user: updated});
  }catch(e){ res.status(500).json({error:'db error'}); }
});

// schedule daily cleanup
setInterval(()=>{ cleanupUploads().then(r=>console.log('daily cleanup done', r)); }, 1000 * 60 * 60 * 24);

// API: crear post (requires auth)
app.post('/api/posts', requireAuth, (req, res) => {
  const {content, image, music_url} = req.body;
  if (!content && !image && !music_url) return res.status(400).json({error: 'content, image, or music_url required'});
  db.getUserById(req.session.userId).then(user=>{
    return db.createPost(user.username, content, image, music_url);
  }).then(post=> res.json(post)).catch(e=> res.status(500).json({error:'db error'}));
});

// API: edit post (requires auth, only author)
app.put('/api/posts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const {content, image, music_url} = req.body;
  try{
    const post = await db.getPostsWithMeta().then(posts => posts.find(p => p.id === id));
    if (!post) return res.status(404).json({error: 'post not found'});
    const user = await db.getUserById(req.session.userId);
    if (post.author !== user.username) return res.status(403).json({error: 'not authorized'});
    const ok = await db.editPost(id, content, image, music_url);
    if (!ok) return res.status(404).json({error: 'post not found'});
    res.json({ok: true});
  }catch(e){ res.status(500).json({error:'db error'}); }
});

// API: delete post (requires auth, only author)
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  try{
    const post = await db.getPostsWithMeta().then(posts => posts.find(p => p.id === id));
    if (!post) return res.status(404).json({error: 'post not found'});
    const user = await db.getUserById(req.session.userId);
    if (post.author !== user.username) return res.status(403).json({error: 'not authorized'});
    const ok = await db.deletePost(id);
    if (!ok) return res.status(404).json({error: 'post not found'});
    res.json({ok: true});
  }catch(e){ res.status(500).json({error:'db error'}); }
});

// API: like post
app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.likePost(id).then(ok=>{
    if (!ok) return res.status(404).json({error: 'post not found'});
    res.json({ok: true});
  }).catch(e=> res.status(500).json({error:'db error'}));
});

// API: comment
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const {text} = req.body;
  if (!text) return res.status(400).json({error: 'text required'});
  db.getUserById(req.session.userId).then(user=>{
    return db.addComment(id, user.username, text);
  }).then(comment=>{
    if (!comment) return res.status(404).json({error: 'post not found'});
    res.json(comment);
  }).catch(e=> res.status(500).json({error:'db error'}));
});

// API: search posts and users
app.get('/api/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({error: 'query required'});
  Promise.all([
    db.searchPosts(q),
    db.searchUsers(q)
  ]).then(([posts, users]) => {
    res.json({posts, users});
  }).catch(e=> res.status(500).json({error:'db error'}));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
} else {
  console.log('server.js required as module; not starting listener');
}

// global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({error: 'internal server error'});
});

// export for programmatic use in scripts/tests
module.exports = { app, cleanupUploads };
