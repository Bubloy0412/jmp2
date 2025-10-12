const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const DATA_JSON = path.join(__dirname, 'data.json');
const DB_FILE = process.env.NODE_ENV === 'production' ? '/tmp/data.sqlite' : path.join(__dirname, 'data.sqlite');

let db;

async function init(){
  db = await open({filename: DB_FILE, driver: sqlite3.Database});
  await db.exec(`PRAGMA foreign_keys = ON;`);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      avatar TEXT
      ,
      is_admin INTEGER DEFAULT 0
    );
  `);
  // ensure column must_change_password exists
  try{
    const cols = await db.all("PRAGMA table_info('users')");
    const hasMust = cols.some(c => c.name === 'must_change_password');
    if (!hasMust){
      await db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;");
      console.log('Added must_change_password column to users table');
    }
  }catch(e){ /* ignore */ }
  // ensure column is_admin exists for older DBs: add it if missing
  try{
    const cols = await db.all("PRAGMA table_info('users')");
    const hasAdmin = cols.some(c => c.name === 'is_admin');
    if (!hasAdmin){
      await db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;");
      console.log('Added is_admin column to users table');
    }
  }catch(e){ /* ignore */ }

  // ensure bio column exists
  try{
    const cols = await db.all("PRAGMA table_info('users')");
    const hasBio = cols.some(c => c.name === 'bio');
    if (!hasBio){
      await db.exec("ALTER TABLE users ADD COLUMN bio TEXT;");
      console.log('Added bio column to users table');
    }
  }catch(e){ /* ignore */ }

  // ensure followers_count column exists
  try{
    const cols = await db.all("PRAGMA table_info('users')");
    const hasFollowers = cols.some(c => c.name === 'followers_count');
    if (!hasFollowers){
      await db.exec("ALTER TABLE users ADD COLUMN followers_count INTEGER DEFAULT 0;");
      console.log('Added followers_count column to users table');
    }
  }catch(e){ /* ignore */ }

  // ensure following_count column exists
  try{
    const cols = await db.all("PRAGMA table_info('users')");
    const hasFollowing = cols.some(c => c.name === 'following_count');
    if (!hasFollowing){
      await db.exec("ALTER TABLE users ADD COLUMN following_count INTEGER DEFAULT 0;");
      console.log('Added following_count column to users table');
    }
  }catch(e){ /* ignore */ }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT,
      content TEXT,
      image TEXT,
      music_url TEXT,
      created_at TEXT,
      likes INTEGER DEFAULT 0
    );
  `);

  // ensure music_url column exists for older posts tables
  try{
    const cols = await db.all("PRAGMA table_info('posts')");
    const hasMusic = cols.some(c => c.name === 'music_url');
    if (!hasMusic){
      await db.exec("ALTER TABLE posts ADD COLUMN music_url TEXT;");
      console.log('Added music_url column to posts table');
    }
  }catch(e){ /* ignore */ }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      author TEXT,
      text TEXT,
      created_at TEXT,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      receiver_id INTEGER,
      status TEXT DEFAULT 'pending',
      created_at TEXT,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER,
      user2_id INTEGER,
      created_at TEXT,
      FOREIGN KEY(user1_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user2_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS private_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER,
      receiver_id INTEGER,
      content TEXT,
      created_at TEXT,
      read INTEGER DEFAULT 0,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT,
      message TEXT,
      related_id INTEGER,
      created_at TEXT,
      read INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // migrate from data.json if DB empty
  const row = await db.get('SELECT COUNT(*) as c FROM users');
  if (row && row.c === 0){
    if (fs.existsSync(DATA_JSON)){
      try{
        const raw = fs.readFileSync(DATA_JSON,'utf8');
        const d = JSON.parse(raw);
        if (Array.isArray(d.users)){
          const insUser = await db.prepare('INSERT OR IGNORE INTO users (id,username,password_hash,avatar,is_admin) VALUES (?,?,?,?,?)');
          for(const u of d.users) await insUser.run(u.id, u.username, u.password_hash || null, u.avatar || null, u.is_admin ? 1 : 0);
          await insUser.finalize();
        }
        if (Array.isArray(d.posts)){
          const insPost = await db.prepare('INSERT OR IGNORE INTO posts (id,author,content,created_at,likes) VALUES (?,?,?,?,?)');
          for(const p of d.posts) await insPost.run(p.id, p.author, p.content, p.created_at, p.likes || 0);
          await insPost.finalize();
        }
        if (Array.isArray(d.comments)){
          const insC = await db.prepare('INSERT OR IGNORE INTO comments (id,post_id,author,text,created_at) VALUES (?,?,?,?,?)');
          for(const c of d.comments) await insC.run(c.id, c.post_id, c.author, c.text, c.created_at);
          await insC.finalize();
        }
      }catch(e){ console.error('migration error', e); }
    }

    // ensure at least one admin exists: create default admin if table empty
    const r2 = await db.get('SELECT COUNT(*) as c FROM users');
    if (r2 && r2.c === 0){
      // create default admin (username: admin, password: admin) - weak default for local demo only
      const hash = await bcrypt.hash('admin', 10);
      await db.run('INSERT INTO users (username,password_hash,is_admin,must_change_password) VALUES (?,?,1,1)', 'admin', hash);
      console.log('Created default admin user: admin / admin (change this in production)');
    } else {
      // if admin user exists with plaintext 'admin' as password, replace with hashed version
      try{
        const maybe = await db.get("SELECT * FROM users WHERE username = 'admin'");
        if (maybe && maybe.password_hash === 'admin'){
          const h = await bcrypt.hash('admin', 10);
          await db.run('UPDATE users SET password_hash = ? WHERE id = ?', h, maybe.id);
          console.log('Rehashed plaintext admin password to bcrypt hash');
        }
      }catch(e){ /* ignore */ }
    }
  }
}

// ensure init called
const initPromise = init();

module.exports = {
  async createUser(username, passwordHash, isAdmin = false){ await initPromise; const r = await db.run('INSERT INTO users (username,password_hash,is_admin) VALUES (?,?,?)', username, passwordHash, isAdmin ? 1 : 0); return {id: r.lastID, username, password_hash: passwordHash}; },
  async getUserByUsername(username){ await initPromise; return await db.get('SELECT id,username,password_hash,avatar,is_admin,must_change_password FROM users WHERE username = ?', username); },
  async getUserById(id){ await initPromise; return await db.get('SELECT id,username,password_hash,avatar,is_admin,must_change_password FROM users WHERE id = ?', id); },
  async getAllUsers(){ await initPromise; return await db.all('SELECT * FROM users'); },
  async setUserAvatar(id, dataUrl){ await initPromise; await db.run('UPDATE users SET avatar = ? WHERE id = ?', dataUrl, id); return await db.get('SELECT * FROM users WHERE id = ?', id); },
  async makeAdmin(id){ await initPromise; await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', id); return await db.get('SELECT * FROM users WHERE id = ?', id); },
  async setUserIsAdmin(id, val){ await initPromise; await db.run('UPDATE users SET is_admin = ? WHERE id = ?', val ? 1 : 0, id); return await db.get('SELECT * FROM users WHERE id = ?', id); },
  async setUserPassword(id, hash){ await initPromise; await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hash, id); return await db.get('SELECT * FROM users WHERE id = ?', id); },
  async createPost(author, content, image = null, music_url = null){ await initPromise; const r = await db.run('INSERT INTO posts (author,content,image,music_url,created_at,likes) VALUES (?,?,?,?,?,0)', author, content, image, music_url, new Date().toISOString()); return {id: r.lastID, author, content, image, music_url, created_at: new Date().toISOString(), likes:0}; },
  async getPostsWithMeta(){ await initPromise; const posts = await db.all('SELECT * FROM posts ORDER BY datetime(created_at) DESC');
    for(const p of posts){ p.comments = await db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY datetime(created_at) ASC', p.id); }
    return posts;
  },
  async likePost(id){ await initPromise; const r = await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', id); return r.changes > 0; },
  async addComment(postId, author, text){ await initPromise; const r = await db.run('INSERT INTO comments (post_id,author,text,created_at) VALUES (?,?,?,?)', postId, author, text, new Date().toISOString()); return {id: r.lastID, post_id: postId, author, text, created_at: new Date().toISOString()}; },
  async editPost(id, content, image = null, music_url = null){ await initPromise; const r = await db.run('UPDATE posts SET content = ?, image = ?, music_url = ? WHERE id = ?', content, image, music_url, id); return r.changes > 0; },
  async deletePost(id){ await initPromise; const r = await db.run('DELETE FROM posts WHERE id = ?', id); return r.changes > 0; },
  async getPosts(limit = null, offset = 0){ await initPromise; const sql = 'SELECT * FROM posts ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?'; const posts = await db.all(sql, limit || -1, offset); for(const p of posts){ p.comments = await db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY datetime(created_at) ASC', p.id); } return posts; },
  async searchPosts(query){ await initPromise; const sql = "SELECT * FROM posts WHERE content LIKE ? ORDER BY datetime(created_at) DESC"; return await db.all(sql, `%${query}%`); },
  async searchUsers(query){ await initPromise; const sql = "SELECT id,username,avatar FROM users WHERE username LIKE ?"; return await db.all(sql, `%${query}%`); },
  async sendFriendRequest(senderId, receiverId){ await initPromise; const r = await db.run('INSERT INTO friend_requests (sender_id,receiver_id,created_at) VALUES (?,?,?)', senderId, receiverId, new Date().toISOString()); return {id: r.lastID}; },
  async acceptFriendRequest(id){ await initPromise; const req = await db.get('SELECT * FROM friend_requests WHERE id = ?', id); if (!req) return false; await db.run('UPDATE friend_requests SET status = ? WHERE id = ?', 'accepted', id); await db.run('INSERT INTO friends (user1_id,user2_id,created_at) VALUES (?,?,?)', req.sender_id, req.receiver_id, new Date().toISOString()); return true; },
  async rejectFriendRequest(id){ await initPromise; const r = await db.run('UPDATE friend_requests SET status = ? WHERE id = ?', 'rejected', id); return r.changes > 0; },
  async getFriendRequests(userId){ await initPromise; return await db.all('SELECT fr.*, u.username as sender_username FROM friend_requests fr JOIN users u ON fr.sender_id = u.id WHERE fr.receiver_id = ? AND fr.status = ?', userId, 'pending'); },
  async getFriends(userId){ await initPromise; const friends = await db.all('SELECT u.id, u.username, u.avatar FROM friends f JOIN users u ON (f.user1_id = u.id OR f.user2_id = u.id) WHERE (f.user1_id = ? OR f.user2_id = ?) AND u.id != ?', userId, userId, userId); return friends; },
  async sendMessage(senderId, receiverId, content){ await initPromise; const r = await db.run('INSERT INTO private_messages (sender_id,receiver_id,content,created_at) VALUES (?,?,?,?)', senderId, receiverId, content, new Date().toISOString()); return {id: r.lastID}; },
  async getMessages(userId, otherId){ await initPromise; return await db.all('SELECT pm.*, u.username as sender_username FROM private_messages pm JOIN users u ON pm.sender_id = u.id WHERE (pm.sender_id = ? AND pm.receiver_id = ?) OR (pm.sender_id = ? AND pm.receiver_id = ?) ORDER BY datetime(pm.created_at) ASC', userId, otherId, otherId, userId); },
  async getMessageThreads(userId){ await initPromise; const sql = `SELECT DISTINCT CASE WHEN pm.sender_id = ? THEN pm.receiver_id ELSE pm.sender_id END as other_id, u.username, u.avatar, pm.content, pm.created_at FROM private_messages pm JOIN users u ON (CASE WHEN pm.sender_id = ? THEN pm.receiver_id ELSE pm.sender_id END = u.id) WHERE pm.sender_id = ? OR pm.receiver_id = ? ORDER BY datetime(pm.created_at) DESC`; return await db.all(sql, userId, userId, userId, userId); },
  async createNotification(userId, type, message, relatedId = null){ await initPromise; const r = await db.run('INSERT INTO notifications (user_id,type,message,related_id,created_at) VALUES (?,?,?,?,?)', userId, type, message, relatedId, new Date().toISOString()); return {id: r.lastID}; },
  async getNotifications(userId){ await initPromise; return await db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY datetime(created_at) DESC', userId); },
  async markNotificationRead(id){ await initPromise; const r = await db.run('UPDATE notifications SET read = 1 WHERE id = ?', id); return r.changes > 0; },
  async setUserBio(id, bio){ await initPromise; await db.run('UPDATE users SET bio = ? WHERE id = ?', bio, id); return await db.get('SELECT * FROM users WHERE id = ?', id); },
  async updateFollowerCounts(){ await initPromise; await db.exec(`UPDATE users SET followers_count = (SELECT COUNT(*) FROM friends WHERE user2_id = users.id), following_count = (SELECT COUNT(*) FROM friends WHERE user1_id = users.id)`); }
};
