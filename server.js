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

// Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN || "8413886563:AAHdpQEsq70sDCTqZvSYa7PsQ4M500URqjA";
let APP_URL = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";

if (!APP_URL.startsWith('http')) APP_URL = 'https://' + APP_URL;

// Telegram Bot
if (BOT_TOKEN) {
    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, "🚀 **Aviator Real Money Game**\n\nPlay live, place bets, and cash out before the plane flies away!", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🎮 Play Aviator Now", web_app: { url: APP_URL } }]
                    ]
                }
            });
        });
        console.log("✅ Telegram Bot initialized!");
    } catch (e) {
        console.error("Bot Init Error:", e.message);
    }
}

// In-Memory User Database (In production, replace with MongoDB)
const users = {}; 

// Game Engine State
let gameState = {
    status: 'WAITING', // WAITING, FLYING, CRASHED
    multiplier: 1.00,
    crashPoint: 1.00,
    bets: {} // { socketId: { userId, amount, cashedOut, winAmount } }
};

// Provably Fair Crash Point Generation
function generateCrashPoint() {
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const subHash = hash.substring(0, 8);
    const num = parseInt(subHash, 16);
    
    if (num % 33 === 0) return 1.00; // House edge instant crash (3%)
    
    const e = Math.pow(2, 52);
    const h = parseInt(hash.substring(0, 13), 16);
    const result = Math.floor((100 * e - h) / (e - h)) / 100;
    return Math.min(Math.max(1.01, result), 100.00);
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

                setTimeout(startGameLoop, 5000); // 5 sec cooldown
            }
        }, 100);
    }, 5000); // 5 sec betting window
}

// Socket Interactions
io.on('connection', (socket) => {
    // Register User
    socket.on('init_user', (telegramUser) => {
        const userId = telegramUser?.id || socket.id;
        if (!users[userId]) {
            users[userId] = {
                id: userId,
                name: telegramUser?.first_name || "Player",
                balance: 1000.00 // Default Rs. 1,000 Demo Balance
            };
        }
        socket.userId = userId;
        socket.emit('user_data', users[userId]);
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    // Place Bet
    socket.on('place_bet', (data) => {
        const user = users[socket.userId];
        const betAmount = parseFloat(data.amount);

        if (gameState.status !== 'WAITING') {
            return socket.emit('error_msg', 'Round in progress! Wait for next round.');
        }
        if (!user || user.balance < betAmount || betAmount <= 0) {
            return socket.emit('error_msg', 'Insufficient balance!');
        }

        user.balance -= betAmount;
        gameState.bets[socket.id] = {
            userId: socket.userId,
            amount: betAmount,
            cashedOut: false
        };

        socket.emit('user_data', user);
        socket.emit('bet_confirmed', { amount: betAmount });
    });

    // Cashout Logic
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
    console.log(`🚀 Real Game Server running on port ${PORT}`);
});
