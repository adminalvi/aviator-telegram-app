
            <html xmlns:o="urn:schemas-microsoft-com:office:office" 
                  xmlns:w="urn:schemas-microsoft-com:office:word" 
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>node_modules.env</title>
                <!--[if gte mso 9]>
                <xml>
                    <w:WordDocument>
                        <w:View>Print</w:View>
                        <w:Zoom>100</w:Zoom>
                    </w:WordDocument>
                </xml>
                <![endif]-->
                <style>
                    @page {
                        size: 8.5in 11in;
                        margin: 1in;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12pt;
                        line-height: 1.5;
                    }
                    h1 { font-size: 24pt; }
                    h2 { font-size: 18pt; }
                    h3 { font-size: 14pt; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #000; padding: 8px; }
                    th { background-color: #f0f0f0; }
                </style>
            </head>
            <body>
                <p>const express = require('express');</p><p>const http = require('http');</p><p>const { Server } = require('socket.io');</p><p>const cors = require('cors');</p><p>const TelegramBot = require('node-telegram-bot-api');</p><p><br></p><p>const app = express();</p><p>app.use(cors());</p><p><br></p><p>// Serve static HTML file directly</p><p>app.use(express.static(__dirname));</p><p><br></p><p>const server = http.createServer(app);</p><p>const io = new Server(server, {</p><p>    cors: { origin: "*", methods: ["GET", "POST"] }</p><p>});</p><p><br></p><p>// Environment variable se token padhega</p><p>const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE";</p><p>const bot = new TelegramBot(BOT_TOKEN, { polling: true });</p><p><br></p><p>// Telegram /start command response with Play Button</p><p>bot.onText(/\/start/, (msg) =&gt; {</p><p>    bot.sendMessage(msg.chat.id, "🚀 **Aviator Live Game**\n\nGame khelne ke liye neeche button par click karein!", {</p><p>        parse_mode: 'Markdown',</p><p>        reply_markup: {</p><p>            inline_keyboard: [[</p><p>                { text: "🚀 Play Aviator Game", web_app: { url: process.env.APP_URL || "https://your-domain.up.railway.app" } }</p><p>            ]]</p><p>        }</p><p>    });</p><p>});</p><p><br></p><p>let gameState = {</p><p>    status: 'WAITING',</p><p>    multiplier: 1.00,</p><p>    crashPoint: 1.00</p><p>};</p><p><br></p><p>function generateCrashPoint() {</p><p>    const e = Math.pow(2, 52);</p><p>    const h = Math.floor(Math.random() * e);</p><p>    return Math.max(1.00, Math.floor((100 * e - h) / (e - h)) / 100);</p><p>}</p><p><br></p><p>function startGameLoop() {</p><p>    gameState.status = 'WAITING';</p><p>    gameState.multiplier = 1.00;</p><p>    io.emit('game_state', gameState);</p><p><br></p><p>    setTimeout(() =&gt; {</p><p>        gameState.status = 'FLYING';</p><p>        gameState.crashPoint = generateCrashPoint();</p><p>        </p><p>        let interval = setInterval(() =&gt; {</p><p>            gameState.multiplier += 0.01;</p><p>            io.emit('tick', { multiplier: gameState.multiplier.toFixed(2) });</p><p><br></p><p>            if (gameState.multiplier &gt;= gameState.crashPoint) {</p><p>                clearInterval(interval);</p><p>                gameState.status = 'CRASHED';</p><p>                io.emit('crashed', { crashPoint: gameState.crashPoint });</p><p>                </p><p>                setTimeout(startGameLoop, 5000);</p><p>            }</p><p>        }, 100);</p><p>    }, 5000);</p><p>}</p><p><br></p><p>app.get('/', (req, res) =&gt; {</p><p>    res.sendFile(__dirname + '/index.html');</p><p>});</p><p><br></p><p>startGameLoop();</p><p><br></p><p>const PORT = process.env.PORT || 3000;</p><p>server.listen(PORT, () =&gt; console.log(`Server running on port ${PORT}`));</p>
            </body>
            </html>
        