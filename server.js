const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());

// Static Files
app.use(express.static(path.join(__dirname)));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Telegram Bot Setup (Using Webhook/Polling safely)
const BOT_TOKEN = process.env.BOT_TOKEN;
if (BOT_TOKEN) {
    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        
        bot.onText(/\/start/, (msg) => {
            const appUrl = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";
            bot.sendMessage(msg.chat.id, "🚀 **Aviator Live Game**\n\nGame khelne ke liye neeche button par click karein!", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: "🚀 Play Aviator Game", web_app: { url: appUrl } }
                    ]]
                }
            });
        });
        console.log("Telegram Bot started successfully!");
    } catch (err) {
        console.log("Bot error:", err);
    }
}

// Game Logic Loop
let gameState = {
    status: 'WAITING',
    multiplier: 1.00,
    crashPoint: 1.00
};

function generateCrashPoint() {
    const e = Math.pow(2, 52);
    const h = Math.floor(Math.random() * e);
    return Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
}

function startGameLoop() {
    gameState.status = 'WAITING';
    gameState.multiplier = 1.00;
    io.emit('game_state', gameState);

    setTimeout(() => {
        gameState.status = 'FLYING';
        gameState.crashPoint = generateCrashPoint();
        
        let interval = setInterval(() => {
            gameState.multiplier += 0.01;
            io.emit('tick', { multiplier: gameState.multiplier.toFixed(2) });

            if (gameState.multiplier >= gameState.crashPoint) {
                clearInterval(interval);
                gameState.status = 'CRASHED';
                io.emit('crashed', { crashPoint: gameState.crashPoint });
                
                setTimeout(startGameLoop, 4000);
            }
        }, 100);
    }, 4000);
}

io.on('connection', (socket) => {
    console.log('New player connected:', socket.id);
    socket.emit('game_state', gameState);

    socket.on('player_cashout', (data) => {
        console.log(`Player cashed out at: ${data.multiplier}x`);
    });
});

startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
