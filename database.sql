-- Create Database
CREATE DATABASE transaction_monitoring;
USE transaction_monitoring;

--------------------------------------------------
-- USERS TABLE
--------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    isBanned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------
-- ACCOUNTS TABLE
--------------------------------------------------
CREATE TABLE accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

--------------------------------------------------
-- TRANSACTIONS TABLE
--------------------------------------------------
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    receiver_id INT,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sender_id) REFERENCES users(id)
        ON DELETE SET NULL,
    FOREIGN KEY (receiver_id) REFERENCES users(id)
        ON DELETE SET NULL
);

--------------------------------------------------
-- FRAUD TABLE
--------------------------------------------------
CREATE TABLE frauds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT,
    reason VARCHAR(255),
    risk_score INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        ON DELETE CASCADE
);

--------------------------------------------------
-- SAMPLE DATA (OPTIONAL BUT GOOD FOR DEMO)
--------------------------------------------------

-- Users
INSERT INTO users (name, email, password) VALUES
('Admin', 'admin@mail.com', 'admin123'),
('User1', 'user1@mail.com', '123'),
('User2', 'user2@mail.com', '123');

-- Accounts
INSERT INTO accounts (user_id, balance) VALUES
(1, 100000),
(2, 5000),
(3, 3000);

-- Transactions
INSERT INTO transactions (sender_id, receiver_id, amount, status) VALUES
(2, 3, 1000, 'completed'),
(3, 2, 2000, 'completed'),
(2, 3, 60000, 'completed'); -- high amount (fraud example)

-- Fraud Example
INSERT INTO frauds (transaction_id, reason, risk_score) VALUES
(3, 'High amount transaction', 80);

--------------------------------------------------
-- INDEXES (FOR PERFORMANCE)
--------------------------------------------------
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_transactions_sender ON transactions(sender_id);
CREATE INDEX idx_transactions_receiver ON transactions(receiver_id);

--------------------------------------------------
-- TRIGGER: AUTO CREATE ACCOUNT AFTER USER
--------------------------------------------------
DELIMITER $$

CREATE TRIGGER create_account_after_user
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO accounts (user_id, balance)
    VALUES (NEW.id, 0);
END$$

DELIMITER ;

--------------------------------------------------
-- TRIGGER: PREVENT NEGATIVE BALANCE
--------------------------------------------------
DELIMITER $$

CREATE TRIGGER prevent_negative_balance
BEFORE UPDATE ON accounts
FOR EACH ROW
BEGIN
    IF NEW.balance < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Insufficient balance!';
    END IF;
END$$

DELIMITER ;

--------------------------------------------------
-- VIEW: FRAUD SUMMARY
--------------------------------------------------
CREATE VIEW fraud_summary AS
SELECT 
    f.id,
    t.amount,
    f.reason,
    f.risk_score,
    f.created_at
FROM frauds f
JOIN transactions t ON f.transaction_id = t.id;