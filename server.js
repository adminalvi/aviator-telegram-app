const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
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

const users = {}; 
let bot = null;

if (BOT_TOKEN) {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `🚀 **Welcome to Aviator Official Gaming Hub!**\n\nYour User ID: \`${chatId}\`\n\nDeposit funds via EasyPaisa or USDT TRC20 to start playing!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "🎮 Open Aviator Game", web_app: { url: APP_URL } }]]
                }
            });
        });

        // ADMIN COMMAND: /addbalance USER_ID AMOUNT
        bot.onText(/\/addbalance (.+) (.+)/, (msg, match) => {
            const senderId = String(msg.chat.id);
            const targetUserId = match[1].trim();
            const amount = parseFloat(match[2]);

            if (!users[targetUserId]) {
                users[targetUserId] = { id: targetUserId, name: 'Player', balance: 0.00 };
            }

            users[targetUserId].balance += amount;
            io.to(targetUserId).emit('user_data', users[targetUserId]);

            bot.sendMessage(senderId, `✅ **Success!** Added PKR ${amount} to User ID: \`${targetUserId}\`.\nNew Balance: PKR ${users[targetUserId].balance}`);
            
            // Notify Player
            try {
                bot.sendMessage(targetUserId, `🎉 **Deposit Approved!** PKR ${amount} has been added to your game account. Enjoy!`);
            } catch(e) {}
        });

        console.log("✅ Telegram Bot initialized!");
    } catch (e) {
        console.error("Bot Error:", e.message);
    }
}

// Game Loop Architecture
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
            users[userId] = { id: userId, name: name.trim(), balance: 0.00 };
        }
        socket.userId = userId;
        socket.join(userId);
        socket.emit('user_data', users[userId]);
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    socket.on('request_deposit', (data) => {
        const userId = socket.userId;
        const user = users[userId];
        
        socket.emit('deposit_notice', { 
            msg: `Deposit request for PKR ${data.amount} via ${data.method} submitted successfully! Admin will verify Transaction ID: ${data.trxId}` 
        });

        // Broadcast to Bot Logs if Bot exists
        if (bot && userId) {
            console.log(`[DEPOSIT REQUEST] User: ${userId} | Amount: ${data.amount} | Method: ${data.method} | TRX: ${data.trxId}`);
        }
    });

    socket.on('place_bet', (data) => {
        const user = users[socket.userId];
        const betAmount = parseFloat(data.amount);

        if (gameState.status !== 'WAITING') return socket.emit('error_msg', 'Round started! Wait for next round.');
        if (!user || user.balance < betAmount || betAmount <= 0) return socket.emit('error_msg', 'Insufficient balance! Please deposit funds.');

        user.balance -= betAmount;
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

        socket.emit('user_data', user);
        socket.emit('cashout_success', { winAmount, multiplier: gameState.multiplier });
    });
});

startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
        
