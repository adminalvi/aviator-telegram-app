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

let users = {};
if (fs.existsSync(DB_FILE)) {
    try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { users = {}; }
}
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

if (!users[ADMIN_CHAT_ID]) {
    users[ADMIN_CHAT_ID] = { id: ADMIN_CHAT_ID, name: 'Admin House', balance: 0.00, wagerRequired: 0.00 };
    saveDB();
}

let bot = null;
if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: { interval: 2000, autoStart: true } });
        
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `🚀 **Welcome to Aviator Official Gaming Hub!**\n\nYour User ID: \`${chatId}\`\n\nDeposit or Withdraw funds directly inside the app!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "🎮 Open Aviator Game", web_app: { url: APP_URL } }]]
                }
            });
        });

        // Fixed /mybalance command
        bot.onText(/\/mybalance/, (msg) => {
            const chatId = String(msg.chat.id);
            if (chatId === ADMIN_CHAT_ID) {
                const adminUser = users[ADMIN_CHAT_ID] || { balance: 0 };
                bot.sendMessage(chatId, `💰 **Admin House Earnings / Balance:** PKR ${adminUser.balance.toFixed(2)}`);
            }
        });

        bot.onText(/\/addbalance (.+) (.+)/, (msg, match) => {
            const senderId = String(msg.chat.id);
            if (senderId !== ADMIN_CHAT_ID) return;

            const targetUserId = match[1].trim();
            const amount = parseFloat(match[2]);

            if (!users[targetUserId]) {
                users[targetUserId] = { id: targetUserId, name: 'Player', balance: 0.00, wagerRequired: 0.00 };
            }

            users[targetUserId].balance += amount;
            users[targetUserId].wagerRequired = (users[targetUserId].wagerRequired || 0) + amount;
            saveDB();

            io.to(targetUserId).emit('user_data', users[targetUserId]);

            bot.sendMessage(senderId, `✅ **Success!** Added PKR ${amount} to User ID: \`${targetUserId}\`.\nNew Balance: PKR ${users[targetUserId].balance}`);
            try {
                bot.sendMessage(targetUserId, `🎉 **Deposit Approved!** PKR ${amount} has been added to your game account. Play games to unlock withdrawal!`);
            } catch(e) {}
        });

    } catch (e) {
        console.error("Bot Error:", e.message);
    }
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

        let interval = setInterval(() => {
            gameState.multiplier = parseFloat((gameState.multiplier + 0.01).toFixed(2));
            io.emit('tick', { multiplier: gameState.multiplier });

            if (gameState.multiplier >= gameState.crashPoint) {
                clearInterval(interval);
                gameState.status = 'CRASHED';

                let totalLostInRound = 0;
                for (let socketId in gameState.bets) {
                    let bet = gameState.bets[socketId];
                    if (!bet.cashedOut) {
                        totalLostInRound += bet.amount;
                    }
                }

                if (totalLostInRound > 0) {
                    if (!users[ADMIN_CHAT_ID]) {
                        users[ADMIN_CHAT_ID] = { id: ADMIN_CHAT_ID, name: 'Admin House', balance: 0.00, wagerRequired: 0.00 };
                    }
                    users[ADMIN_CHAT_ID].balance += totalLostInRound;
                    saveDB();
                }

                io.emit('crashed', { crashPoint: gameState.crashPoint });
                setTimeout(startGameLoop, 5000);
            }
        }, 100);
    }, 5000);
}

io.on('connection', (socket) => {
    socket.on('init_user', (tgUser) => {
        const userId = tgUser?.id ? String(tgUser.id) : socket.id;
        const name = tgUser?.first_name ? `${tgUser.first_name} ${tgUser.last_name || ''}` : 'Player';

        if (!users[userId]) {
            users[userId] = { id: userId, name: name.trim(), balance: 0.00, wagerRequired: 0.00 };
            saveDB();
        }
        socket.userId = userId;
        socket.join(userId);
        socket.emit('user_data', users[userId]);
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    socket.on('request_deposit', (data) => {
        const userId = socket.userId;
        socket.emit('deposit_notice', { 
            msg: `Deposit request for PKR ${data.amount} via ${data.method} submitted! Admin will verify Transaction ID: ${data.trxId}` 
        });

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID, `📥 **NEW DEPOSIT REQUEST!**\n\n👤 **User ID:** \`${userId}\`\n💵 **Amount:** PKR ${data.amount}\n💳 **Method:** ${data.method}\n🧾 **TRX ID:** \`${data.trxId}\`\n\nTo approve send:\n\`/addbalance ${userId} ${data.amount}\``, { parse_mode: 'Markdown' });
        }
    });

    socket.on('request_withdraw', (data) => {
        const userId = socket.userId;
        const user = users[userId];
        const withdrawAmount = parseFloat(data.amount);

        if (!user || user.balance < withdrawAmount) {
            return socket.emit('error_msg', 'Insufficient balance for withdrawal!');
        }

        if (withdrawAmount < 500) {
            return socket.emit('error_msg', 'Minimum withdrawal limit is PKR 500!');
        }

        if (user.wagerRequired && user.wagerRequired > 0) {
            return socket.emit('error_msg', `Cannot withdraw! You need to play PKR ${user.wagerRequired.toFixed(2)} worth of bets first before withdrawing.`);
        }

        user.balance -= withdrawAmount;
        saveDB();
        socket.emit('user_data', user);

        socket.emit('withdraw_notice', { 
            msg: `Withdrawal request for PKR ${withdrawAmount} submitted successfully! Funds will be transferred shortly.` 
        });

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID, `📤 **NEW WITHDRAWAL REQUEST!**\n\n👤 **User ID:** \`${userId}\`\n💵 **Amount:** PKR ${withdrawAmount}\n💳 **Method:** ${data.method}\n🏦 **Account Details:** \`${data.accountDetails}\`\n\nPlease transfer PKR ${withdrawAmount} to the user!`, { parse_mode: 'Markdown' });
        }
    });

    socket.on('place_bet', (data) => {
        const user = users[socket.userId];
        const betAmount = parseFloat(data.amount);

        if (gameState.status !== 'WAITING') return socket.emit('error_msg', 'Round started! Wait for next round.');
        if (!user || user.balance < betAmount || betAmount <= 0) return socket.emit('error_msg', 'Insufficient balance!');

        user.balance -= betAmount;
        
        if (user.wagerRequired > 0) {
            user.wagerRequired = Math.max(0, user.wagerRequired - betAmount);
        }
        
        saveDB();

        gameState.bets[socket.id] = { userId: socket.userId, amount: betAmount, cashedOut: false };

        socket.emit('user_data', user);
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

        socket.emit('user_data', user);
        socket.emit('cashout_success', { winAmount, multiplier: gameState.multiplier });
    });
});

startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
