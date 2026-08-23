const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname)));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const BOT_TOKEN = process.env.BOT_TOKEN || "8413886563:AAHdpQEsq70sDCTqZvSYa7PsQ4M500URqjA";
let APP_URL = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";
if (!APP_URL.startsWith('http')) APP_URL = 'https://' + APP_URL;

if (BOT_TOKEN) {
    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, "🚀 **Welcome to Real Aviator Gaming Hub!**\n\nDeposit via EasyPaisa, JazzCash, Bank, or USDT and start winning real multipliers!", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🎮 Open Aviator Game", web_app: { url: APP_URL } }]
                    ]
                }
            });
        });
        console.log("✅ Telegram Bot initialized!");
    } catch (e) {
        console.error("Bot Error:", e.message);
    }
}

// Database simulation (In production, use MongoDB/PostgreSQL)
const users = {}; 

let gameState = {
    status: 'WAITING', 
    multiplier: 1.00,
    crashPoint: 1.00,
    bets: {}
};

function generateCrashPoint() {
    const e = Math.pow(2, 52);
    const h = Math.floor(Math.random() * e);
    const result = Math.max(1.01, Math.floor((100 * e - h) / (e - h)) / 100);
    return Math.min(result, 100.00);
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
            users[userId] = { id: userId, name: name.trim(), balance: 0.00 }; // Real users start with 0 balance until deposit
        }
        socket.userId = userId;
        socket.emit('user_data', users[userId]);
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    // Handle Deposit Request (Sends manual instruction / pending request)
    socket.on('request_deposit', (data) => {
        const user = users[socket.userId];
        if (user) {
            // Automatic testing credit or logging deposit request
            socket.emit('deposit_notice', { 
                method: data.method, 
                amount: data.amount, 
                msg: `Deposit request of PKR ${data.amount} via ${data.method} received. Admin verification pending.` 
            });
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Aviator Server running on port ${PORT}`);
});
              
