const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN || "8413886563:AAHdpQEsq70sDCTqZvSYa7PsQ4M500URqjA";
let APP_URL = process.env.APP_URL || "https://aviator-telegram-app-production.up.railway.app";
if (!APP_URL.startsWith('http')) APP_URL = 'https://' + APP_URL;
const ADMIN_CHAT_ID = "8873354547";
const MONGO_URI = process.env.MONGO_URI || "YOUR_MONGODB_CONNECTION_STRING_HERE";

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Database Schemas
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: 'Player' },
    balance: { type: Number, default: 0.00 },
    wagerRequired: { type: Number, default: 0.00 },
    totalWagered: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const codeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    amount: Number,
    maxUses: Number,
    usedBy: [String]
});
const RedeemCode = mongoose.model('RedeemCode', codeSchema);

// VIP Level Helper
function getVipLevel(totalWagered = 0) {
    if (totalWagered >= 100000) return '👑 VIP KING';
    if (totalWagered >= 50000) return '💎 PLATINUM';
    if (totalWagered >= 10000) return '🥇 GOLD';
    if (totalWagered >= 2000) return '🥈 SILVER';
    return '🥉 BRONZE';
}

// Telegram Bot Setup
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

        bot.onText(/\/mybalance/, async (msg) => {
            const chatId = String(msg.chat.id);
            if (chatId === ADMIN_CHAT_ID) {
                let admin = await User.findOne({ id: ADMIN_CHAT_ID });
                if (!admin) admin = await User.create({ id: ADMIN_CHAT_ID, name: 'Admin House', balance: 0 });
                bot.sendMessage(chatId, `💰 **Admin House Balance:** PKR ${admin.balance.toFixed(2)}`);
            }
        });

        bot.onText(/\/adminwithdraw (.+)/, async (msg, match) => {
            const chatId = String(msg.chat.id);
            if (chatId !== ADMIN_CHAT_ID) return;

            const amount = parseFloat(match[1]);
            let admin = await User.findOne({ id: ADMIN_CHAT_ID });

            if (!admin || admin.balance < amount) {
                return bot.sendMessage(chatId, `❌ **Insufficient Admin Balance!**\nAvailable: PKR ${admin ? admin.balance.toFixed(2) : 0}`);
            }

            admin.balance -= amount;
            await admin.save();

            const receipt = `🎉 **ADMIN PROFIT WITHDRAWAL** 🎉\n\n` +
                            `💵 **Amount Released:** PKR ${amount}\n` +
                            `💰 **Remaining House Balance:** PKR ${admin.balance.toFixed(2)}\n\n` +
                            `📲 **Send To EasyPaisa:**\n` +
                            `• **Account Name:** Saleem Akram\n` +
                            `• **Status:** Approved & Deducted\n\n` +
                            `*(Yeh rakam aapke game profit se nikali ja chuki hai)*`;

            bot.sendMessage(chatId, receipt, { parse_mode: 'Markdown' });
        });

        bot.onText(/\/makecode (.+) (.+) (.+)/, async (msg, match) => {
            if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;

            const code = match[1].trim().toUpperCase();
            const amount = parseFloat(match[2]);
            const maxUses = parseInt(match[3]);

            await RedeemCode.updateOne({ code }, { amount, maxUses, usedBy: [] }, { upsert: true });
            bot.sendMessage(msg.chat.id, `🎁 **VIP Redeem Code Created!**\n\n🔑 **Code:** \`${code}\`\n💵 **Amount:** PKR ${amount}\n👥 **Max Uses:** ${maxUses}`, { parse_mode: 'Markdown' });
        });

        bot.onText(/\/addbalance (.+) (.+)/, async (msg, match) => {
            if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
            const targetUserId = match[1].trim();
            const amount = parseFloat(match[2]);

            let user = await User.findOne({ id: targetUserId });
            if (!user) user = new User({ id: targetUserId });

            user.balance += amount;
            user.wagerRequired = (user.wagerRequired || 0) + amount;
            await user.save();

            io.to(targetUserId).emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
            bot.sendMessage(msg.chat.id, `✅ Added PKR ${amount} to User ID: \`${targetUserId}\``);
        });

    } catch (e) { console.error("Bot Error:", e.message); }
}

// Game Engine
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

    setTimeout(async () => {
        gameState.status = 'FLYING';
        gameState.crashPoint = generateCrashPoint();
        io.emit('game_started', { status: 'FLYING' });

        let interval = setInterval(async () => {
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
                    await User.updateOne(
                        { id: ADMIN_CHAT_ID },
                        { $inc: { balance: totalLostInRound }, $setOnInsert: { name: 'Admin House' } },
                        { upsert: true }
                    );
                }

                io.emit('crashed', { crashPoint: gameState.crashPoint });
                setTimeout(startGameLoop, 3000);
            }
        }, 100);
    }, 5000);
}

// Socket.io Real-time Handlers
io.on('connection', (socket) => {
    socket.on('init_user', async (tgUser) => {
        const userId = tgUser?.id ? String(tgUser.id) : socket.id;
        const name = tgUser?.first_name ? `${tgUser.first_name} ${tgUser.last_name || ''}` : 'Player';

        let user = await User.findOne({ id: userId });
        if (!user) {
            user = await User.create({ id: userId, name: name.trim() });
        }

        socket.userId = userId;
        socket.join(userId);

        socket.emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('game_state', { status: gameState.status, multiplier: gameState.multiplier });
    });

    // Handle Deposit Request from Web App
    socket.on('request_deposit', async (data) => {
        const userId = socket.userId;
        const amount = parseFloat(data.amount);
        const method = data.method || 'EasyPaisa/JazzCash';
        const tid = data.trxId || 'N/A';

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID, 
                `📥 **NEW DEPOSIT REQUEST**\n\n` +
                `👤 **User ID:** \`${userId}\`\n` +
                `💵 **Amount:** PKR ${amount}\n` +
                `💳 **Method:** ${method}\n` +
                `🧾 **Trx ID:** \`${tid}\`\n\n` +
                `*Approve karne ke liye bhein:* \`/addbalance ${userId} ${amount}\``,
                { parse_mode: 'Markdown' }
            );
        }
        socket.emit('deposit_notice', { msg: '✅ Deposit request submitted to Admin for verification!' });
    });

    // Handle Withdraw Request from Web App
    socket.on('request_withdraw', async (data) => {
        const userId = socket.userId;
        const user = await User.findOne({ id: userId });
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
        await user.save();

        if (bot) {
            bot.sendMessage(ADMIN_CHAT_ID,
                `📤 **NEW WITHDRAWAL REQUEST**\n\n` +
                `👤 **User ID:** \`${userId}\`\n` +
                `💵 **Amount:** PKR ${amount}\n` +
                `📱 **Account Number:** \`${accountNo}\` (${method})\n` +
                `💰 **Remaining Balance:** PKR ${user.balance.toFixed(2)}\n\n` +
                `*Manually transfer karke mark kar dein.*`,
                { parse_mode: 'Markdown' }
            );
        }

        socket.emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('deposit_notice', { msg: '✅ Withdrawal request submitted successfully!' });
    });

    socket.on('redeem_code', async (data) => {
        const codeStr = (data.code || '').trim().toUpperCase();
        const userId = socket.userId;

        const codeDoc = await RedeemCode.findOne({ code: codeStr });
        if (!codeDoc) return socket.emit('error_msg', 'Invalid Code!');
        if (codeDoc.usedBy.includes(userId)) return socket.emit('error_msg', 'You already used this code!');
        if (codeDoc.usedBy.length >= codeDoc.maxUses) return socket.emit('error_msg', 'Code limit reached!');

        codeDoc.usedBy.push(userId);
        await codeDoc.save();

        const user = await User.findOne({ id: userId });
        user.balance += codeDoc.amount;
        user.wagerRequired = (user.wagerRequired || 0) + codeDoc.amount;
        await user.save();

        socket.emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('deposit_notice', { msg: `🎉 VIP Code Claimed! Added PKR ${codeDoc.amount} to your balance.` });
    });

    socket.on('place_bet', async (data) => {
        const user = await User.findOne({ id: socket.userId });
        const betAmount = parseFloat(data.amount);

        if (gameState.status !== 'WAITING') return socket.emit('error_msg', 'Wait for next round!');
        if (!user || user.balance < betAmount || betAmount <= 0) return socket.emit('error_msg', 'Insufficient balance!');

        user.balance -= betAmount;
        user.totalWagered = (user.totalWagered || 0) + betAmount;
        if (user.wagerRequired > 0) user.wagerRequired = Math.max(0, user.wagerRequired - betAmount);
        await user.save();

        gameState.bets[socket.id] = { userId: socket.userId, amount: betAmount, cashedOut: false };
        socket.emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('bet_confirmed', { amount: betAmount });
    });

    socket.on('cashout', async () => {
        const bet = gameState.bets[socket.id];
        const user = await User.findOne({ id: socket.userId });

        if (gameState.status !== 'FLYING' || !bet || bet.cashedOut) return;

        bet.cashedOut = true;
        const winAmount = parseFloat((bet.amount * gameState.multiplier).toFixed(2));
        user.balance += winAmount;
        await user.save();

        socket.emit('user_data', { ...user.toObject(), vipLevel: getVipLevel(user.totalWagered) });
        socket.emit('cashout_success', { winAmount, multiplier: gameState.multiplier });
    });
});

startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
