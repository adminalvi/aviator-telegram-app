const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());

// Serve Static Files & Handle Favicon (Fixes Railway HTTP 404 Logs)
app.use(express.static(path.join(__dirname)));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Telegram Bot Setup - Uses Railway Variable or Fallback Token
const BOT_TOKEN = process.env.BOT_TOKEN || "8413886563:AAHdpQEsq70sDCTqZvSYa7PsQ4M500URqjA";
let rawAppUrl = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";

// Ensure URL starts with https://
if (!rawAppUrl.startsWith('http://') && !rawAppUrl.startsWith('https://')) {
    rawAppUrl = 'https://' + rawAppUrl;
}

if (BOT_TOKEN) {
    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: true });
        
        bot.onText(/\/start/, (msg) => {
            bot.sendMessage(msg.chat.id, "🚀 **Welcome to Aviator Live Game!**\n\nGame khelne ke liye neeche button par click karein!", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🚀 Play Aviator Game", web_app: { url: rawAppUrl } }]
                    ]
                }
            }).catch((err) => {
                console.error("Telegram SendMessage Error:", err.message);
            });
        });

        console.log("✅ Telegram Bot polling started successfully!");
    } catch (err) {
        console.error("❌ Telegram Bot Error:", err.message);
    }
} else {
    console.warn("⚠️ BOT_TOKEN is missing!");
}

// Aviator Game Loop Logic
let gameState = {
    status: 'WAITING', // WAITING, FLYING, CRASHED
    multiplier: 1.00,
    crashPoint: 1.00
};

function generateCrashPoint() {
    const e = Math.pow(2, 52);
    const h = Math.floor(Math.random() * e);
    const result = Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);
    return Math.min(result, 100.00); // Max multiplier cap 100x
}

function startGameLoop() {
    gameState.status = 'WAITING';
    gameState.multiplier = 1.00;
    io.emit('game_state', gameState);

    setTimeout(() => {
        gameState.status = 'FLYING';
        gameState.crashPoint = generateCrashPoint();
        
        let interval = setInterval(() => {
            gameState.multiplier = parseFloat((gameState.multiplier + 0.01).toFixed(2));
            io.emit('tick', { multiplier: gameState.multiplier });

            if (gameState.multiplier >= gameState.crashPoint) {
                clearInterval(interval);
                gameState.status = 'CRASHED';
                io.emit('crashed', { crashPoint: gameState.crashPoint });
                
                // Wait 4 seconds before next round
                setTimeout(startGameLoop, 4000);
            }
        }, 100);
    }, 4000);
}

// Socket Connection
io.on('connection', (socket) => {
    console.log('🎮 New player connected:', socket.id);
    socket.emit('game_state', gameState);

    socket.on('player_cashout', (data) => {
        console.log(`💰 Player cashed out at ${data.multiplier}x`);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
    });
});

// Start Server Engine
startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
