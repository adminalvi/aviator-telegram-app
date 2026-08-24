const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const BOT_TOKEN = process.env.BOT_TOKEN || "8413886563:AAHdpQEsq70sDCTqZvSYa7PsQ4M500URqjA";
let APP_URL = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";
if (!APP_URL.startsWith('http')) APP_URL = 'https://' + APP_URL;

const ADMIN_CHAT_ID = "8873354547";
const DB_FILE = path.join(__dirname, 'users_db.json');
const CODES_FILE = path.join(__dirname, 'redeem_codes.json');

let users = {};
if (fs.existsSync(DB_FILE)) {
    try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { users = {}; }
}
function saveDB() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); } catch(e){}
}

let redeemCodes = {};
if (fs.existsSync(CODES_FILE)) {
    try { redeemCodes = JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); } catch(e) { redeemCodes = {}; }
}
function saveCodes() {
    try { fs.writeFileSync(CODES_FILE, JSON.stringify(redeemCodes, null, 2)); } catch(e){}
}

if (!users[ADMIN_CHAT_ID]) {
    users[ADMIN_CHAT_ID] = { id: ADMIN_CHAT_ID, name: 'Admin House', balance: 0.00, wagerRequired: 0.00, totalWagered: 0 };
    saveDB();
}

function getVipLevel(totalWagered = 0) {
    if (totalWagered >= 100000) return '👑 VIP KING';
    if (totalWagered >= 50000) return '💎 PLATINUM';
    if (totalWagered >= 10000) return '🥇 GOLD';
    if (totalWagered >= 2000) return '🥈 SILVER';
    return '🥉 BRONZE';
}

let bot = null;
if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });

        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, `🚀 **Welcome to Aviator Official Gaming Hub!**\n\nYour User ID: \`${msg.chat.id}\``, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🎮 Open Aviator VIP Game", web_app: { url: APP_URL } }]] }
            });
        });

        bot.onText(/\/mybalance/, (msg) => {
            const chatId = String(msg.chat.id);
            if (chatId === ADMIN_CHAT_ID) {
                const adminUser = users[ADMIN_CHAT_ID] || { balance: 0 };
                bot.sendMessage(chatId, `💰 **Admin House Balance:** PKR ${adminUser.balance.toFixed(2)}`);
            }
        });

        bot.onText(/\/adminwithdraw (.+)/, (msg, match) => {
            const chatId = String(msg.chat.id);
            if (chatId !== ADMIN_CHAT_ID) return;

            const amount = parseFloat(match[1]);
            const adminUser = users[ADMIN_CHAT_ID];

            if (!adminUser || adminUser.balance < amount) {
                return bot.sendMessage(chatId, `❌ **Insufficient Admin Balance!**\nAvailable: PKR ${adminUser ? adminUser.balance.toFixed(2) : 0}`);
            }

            adminUser.balance -= amount;
            saveDB();

            const receipt = `🎉 **ADMIN PROFIT WITHDRAWAL** 🎉\n\n` +
                            `💵 **Amount Released:** PKR ${amount}\n` +
                            `💰 **Remaining House Balance:** PKR ${adminUser.balance.toFixed(2)}\n\n` +
                            `📲 **Send To EasyPaisa:**\n` +
                            `• **Account Name:** Saleem Akram\n` +
                            `• **IBAN:** PK95TMFB0000000027110903\n\n` +
                            `*(Yeh rakam aapke game profit se nikali ja chuki hai)*`;

            bot.sendMessage(chatId, receipt, { parse_mode: 'Markdown' });
        });

        bot.onText(/\/makecode (.+) (.+) (.+)/, (msg, match) => {
            if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;

            const code = match[1].trim().toUpperCase();
            const amount = parseFloat(match[2]);
            const maxUses = parseInt(match[3]);

            redeemCodes[code] = { amount, maxUses, usedBy: [] };
            saveCodes();

            bot.sendMessage(msg.chat.id, `🎁 **VIP Redeem Code Created!**\n\n🔑 **Code:** \`${code}\`\n💵 **Amount:** PKR ${amount}\n👥 **Max Uses:** ${maxUses}`, { parse_mode: 'Markdown' });
        });

        bot.onText(/\/addbalance (.+) (.+)/, (msg, match) => {
            if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
            const targetUserId = match[1].trim();
            const amount = parseFloat(match[2]);

            if (!users[targetUserId]) users[targetUserId] = { id: targetUserId, name: 'Player', balance: 0.00, wagerRequired: 0.00, totalWagered: 0 };

            users[targetUserId].balance += amount;
            users[targetUserId].wagerRequired = (users[targetUserId].wagerRequired || 0) + amount;
            saveDB();

            io.to(targetUserId).emit('user_data', { ...users[targetUserId], vipLevel: getVipLevel(users[targetUserId].totalWagered) });
            bot.sendMessage(msg.chat.id, `✅ Added PKR ${amount} to User ID: \`${targetUserId}\``);
        });

    } catch (e) { console.error("Bot Error:", e.message); }
}

let gameState = { status: 'WAITING', multiplier: 1.00, crashPoint: 1.00, bets: {} };

function generateCrashPoint() {
    const e = Math.pow(2, 52);
    const h = Math.floor(Math.random() * e);
    return Math.min(Math.max(1.01, Math.floor((100 * e - h) / (e - h)) / 100), 100.00);
}

function startGameLoop() {
    gameState.status = 'WAITING';
    gameState.multiplier = 1.00;
    gameState.bets = {};
    io.emit('game_state', { status: gameState.status, multiplier: 1.00 });

    setTimeout(() => {
        gameState.status = 'FLYING';
        gameState.crashPoint = generateCrashPoint();
        io.emit('game_started', { status: 'FLYING' });

        // Admin Live Crash Target Alert
        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID, `🎯 **LIVE ROUND ALERT**\nTarget Crash Point: **${gameState.crashPoint.toFixed(2)}x**`, { parse_mode: 'Markdown' });
        }

        let interval = setInterval(() => {
            gameState.multiplier = parseFloat((gameState.multiplier + 0.01).toFixed(2));
            io.emit('tick', { multiplier: gameState.multiplier });

            if (gameState.multiplier >= gameState.crashPoint) {
                clearInterval(interval);
                gameState.status = 'CRASHED';

                let totalLostInRound = 0;
                for (let socketId in gameState.bets) {
                    let bet = gameState.bets[socketId];
                    if (!bet.cashedOut) totalLostInRound += bet.amount;
                }

                if (totalLostInRound > 0) {
                    if (!users[ADMIN_CHAT_ID]) users[ADMIN_CHAT_ID] = { id: ADMIN_CHAT_ID, name: 'Admin House', balance: 0.00, wagerRequired: 0.00, totalWagered: 0 };
                    users[ADMIN_CHAT_ID].balance += totalLostInRound;
                    saveDB();
                }

                io.emit('crashed', { crashPoint: gameState.crashPoint });
                setTimeout(startGameLoop, 3000);
            }
        }, 100);
    }, 5000);
}

io.on('connection', (socket) => {
    socket.on('init_user', (tgUser) => {
        const userId = tgUser?.id ? String(tgUser.id) : socket.id;
        const name = tgUser?.first_name ? `${tgUser.first_name} ${tgUser.last_name || ''}` : 'Player';

        if (!users[userId]) users[userId] = { id: userId, name: name.trim(), balance: 0.00, wagerRequired: 0.00, totalWagered: 0 };
        socket.userId = userId;
        socket.join(userId);

        socket.emit('user_data', { ...users[userId], vipLevel: getVipLevel(users[userId].totalWagered) });
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    socket.on('request_deposit', (data) => {
        const userId = socket.userId;
        const amount = parseFloat(data.amount);
        const method = data.method || 'EasyPaisa/JazzCash/TRC20';
        const tid = data.trxId || 'N/A';
        const screenshot = data.screenshot || 'No Screenshot Provided';

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID, 
                `📥 **NEW DEPOSIT REQUEST**\n\n` +
                `👤 **User ID:** \`${userId}\`\n` +
                `💵 **Amount:** PKR ${amount}\n` +
                `💳 **Method:** ${method}\n` +
                `🧾 **Trx ID:** \`${tid}\`\n` +
                `🖼 **Screenshot Proof:** ${screenshot}\n\n` +
                `*Approve karne ke liye bhein:* \`/addbalance ${userId} ${amount}\``,
                { parse_mode: 'Markdown' }
            );
        }
        socket.emit('deposit_notice', { msg: '✅ Deposit request submitted to Admin for verification!' });
    });

    socket.on('request_withdraw', (data) => {
        const userId = socket.userId;
        const user = users[userId];
        const amount = parseFloat(data.amount);
        const accountNo = data.accountNo;
        const method = data.method || 'EasyPaisa';

        if (!user || user.balance < amount) {
            return socket.emit('error_msg', 'Insufficient Balance!');
        }

        if (user.wagerRequired > 0) {
            return socket.emit('error_msg', `Complete Wager First! Required: PKR ${user.wagerRequired.toFixed(2)}`);
        }

        user.balance -= amount;
        saveDB();

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID,
                `📤 **NEW WITHDRAWAL REQUEST**\n\n` +
                `👤 **User ID:** \`${userId}\`\n` +
                `💵 **Amount:** PKR ${amount}\n` +
                `📱 **Account / Wallet:** \`${accountNo}\` (${method})\n` +
                `💰 **Remaining Balance:** PKR ${user.balance.toFixed(2)}\n\n` +
                `*Manually transfer karke mark kar dein.*`,
                { parse_mode: 'Markdown' }
            );
        }

        socket.emit('user_data', { ...user, vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('deposit_notice', { msg: '✅ Withdrawal request submitted successfully!' });
    });

    socket.on('redeem_code', (data) => {
        const code = (data.code || '').trim().toUpperCase();
        const userId = socket.userId;
        const user = users[userId];

        if (!redeemCodes[code]) return socket.emit('error_msg', 'Invalid Code!');
        const item = redeemCodes[code];

        if (item.usedBy.includes(userId)) return socket.emit('error_msg', 'You already used this code!');
        if (item.usedBy.length >= item.maxUses) return socket.emit('error_msg', 'Code limit reached!');

        item.usedBy.push(userId);
        user.balance += item.amount;
        user.wagerRequired = (user.wagerRequired || 0) + item.amount;
        saveCodes();
        saveDB();

        socket.emit('user_data', { ...user, vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('deposit_notice', { msg: `🎉 VIP Code Claimed! Added PKR ${item.amount} to your balance.` });
    });

    socket.on('place_bet', (data) => {
        const user = users[socket.userId];
        const betAmount = parseFloat(data.amount);

        if (gameState.status !== 'WAITING') return socket.emit('error_msg', 'Wait for next round!');
        if (!user || user.balance < betAmount || betAmount <= 0) return socket.emit('error_msg', 'Insufficient balance!');

        user.balance -= betAmount;
        user.totalWagered = (user.totalWagered || 0) + betAmount;
        if (user.wagerRequired > 0) user.wagerRequired = Math.max(0, user.wagerRequired - betAmount);
        saveDB();

        gameState.bets[socket.id] = { userId: socket.userId, amount: betAmount, cashedOut: false };
        socket.emit('user_data', { ...user, vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('bet_confirmed', { amount: betAmount });
    });

    socket.on('cashout', () => {
        const bet = gameState.bets[socket.id];
        const user = users[socket.userId];

        if (gameState.status !== 'FLYING' || !bet || bet.cashedOut) return;

        bet.cashedOut = true;
        const winAmount = parseFloat((bet.amount * gameState.multiplier).toFixed(2));
        user.balance += winAmount;
        saveDB();

        socket.emit('user_data', { ...user, vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('cashout_success', { winAmount, multiplier: gameState.multiplier });
    });
});

startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
