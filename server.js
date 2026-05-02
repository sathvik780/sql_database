const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// DB CONNECTION (use a pool with promises)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '160224737170@aA',
  database: 'fraud_detection',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper for errors
function handleError(res, err){
  console.error(err);
  return res.status(500).json({ error: String(err) });
}

// POST /transaction
app.post('/transaction', async (req, res) => {
  try {
    const { id, sender, receiver, amount } = req.body;
    if (!id || !sender || !receiver || typeof amount === 'undefined') {
      return res.status(400).json({ error: 'id, sender, receiver and amount are required' });
    }

    // ensure BannedAccounts table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS BannedAccounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // check if sender or receiver is banned
    const [banRows] = await pool.query('SELECT account_id, reason FROM BannedAccounts WHERE account_id IN (?, ?)', [sender, receiver]);
    if (banRows.length > 0) {
      return res.status(403).json({ error: 'Blocked: account banned', bans: banRows });
    }

    const insertQuery = `
      INSERT INTO \`Transaction\`
        (transaction_id, sender_account_id, receiver_account_id, amount, status)
      VALUES (?, ?, ?, ?, 'SUCCESS')
    `;
    await pool.execute(insertQuery, [id, sender, receiver, amount]);

    const [fraudRows] = await pool.execute('SELECT * FROM Fraud_Flag WHERE transaction_id = ?', [id]);

    return res.json({ message: 'Transaction added', fraud: fraudRows });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /user
app.post('/user', async (req, res) => {
  try {
    const { id, name, email, phone } = req.body;
    if (!id || !name || !email || !phone) {
      return res.status(400).json({ error: 'id, name, email and phone are required' });
    }
    const query = `INSERT INTO Users (user_id, name, email, phone) VALUES (?, ?, ?, ?)`;
    await pool.execute(query, [id, name, email, phone]);
    return res.json({ message: 'User added' });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /account
app.post('/account', async (req, res) => {
  try {
    const { id, user_id, balance, type } = req.body;
    if (!id || !user_id) {
      return res.status(400).json({ error: 'id and user_id are required' });
    }
    const query = `INSERT INTO Account (account_id, user_id, balance, account_type) VALUES (?, ?, ?, ?)`;
    await pool.execute(query, [id, user_id, balance || 0, type || null]);
    return res.json({ message: 'Account added' });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /dashboard
app.get('/dashboard', async (req, res) => {
  try {
    const query = `
      SELECT 
        u.name AS user_name,
        a.account_id,
        t.transaction_id,
        t.amount,
        t.status,
        IFNULL(f.rule_triggered, 'SAFE') AS fraud_status
      FROM Users u
      JOIN Account a ON u.user_id = a.user_id
      JOIN \`Transaction\` t ON a.account_id = t.sender_account_id
      LEFT JOIN Fraud_Flag f ON t.transaction_id = f.transaction_id
    `;
    const [rows] = await pool.query(query);
    return res.json(rows);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /users (no account-ban column here, keep as-is or include user-level info if needed)
app.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT user_id, name, email, phone FROM Users');
    return res.json(rows);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /accounts (include banned flag)
app.get('/accounts', async (req, res) => {
  try {
    // ensure BannedAccounts exists (safe no-op)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS BannedAccounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const query = `
      SELECT a.account_id, a.user_id, a.balance, a.account_type,
        IF(b.account_id IS NULL, 0, 1) AS banned,
        b.reason AS ban_reason
      FROM Account a
      LEFT JOIN BannedAccounts b ON b.account_id = a.account_id
    `;
    const [rows] = await pool.query(query);
    return res.json(rows);
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /banned_accounts - list bans
app.get('/banned_accounts', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS BannedAccounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [rows] = await pool.query('SELECT account_id, reason, created_at FROM BannedAccounts ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /ban/account - manually ban an account
// body: { account_id: string, reason?: string }
app.post('/ban/account', async (req, res) => {
  try {
    const { account_id, reason } = req.body;
    if (!account_id) return res.status(400).json({ error: 'account_id is required' });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BannedAccounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(128) NOT NULL UNIQUE,
        reason VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const sql = `INSERT INTO BannedAccounts (account_id, reason) VALUES (?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = NOW()`;
    await pool.query(sql, [account_id, reason || 'Manually banned by admin']);
    return res.json({ message: 'Account banned', account_id });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /unban/account - remove a ban
// body: { account_id: string }
app.post('/unban/account', async (req, res) => {
  try {
    const { account_id } = req.body;
    if (!account_id) return res.status(400).json({ error: 'account_id is required' });
    const [result] = await pool.query('DELETE FROM BannedAccounts WHERE account_id = ?', [account_id]);
    return res.json({ message: 'Account unbanned', deleted: result.affectedRows });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /transactions  (also respond to common aliases)
app.get(['/transactions','/transactions/','/transaction','/tx','/transactions/list'], async (req, res) => {
  try {
    console.log('GET transactions -> path:', req.path);
    const query = `
      SELECT
        t.transaction_id,
        t.sender_account_id AS sender,
        t.receiver_account_id AS receiver,
        t.amount,
        t.status,
        IFNULL(f.rule_triggered, 'SAFE') AS fraud_status
      FROM \`Transaction\` t
      LEFT JOIN Fraud_Flag f ON t.transaction_id = f.transaction_id
      ORDER BY t.transaction_id DESC
    `;
    const [rows] = await pool.query(query);
    return res.json(rows);
  } catch (err) {
    return handleError(res, err);
  }
});

// start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
app.use(express.static('public'));