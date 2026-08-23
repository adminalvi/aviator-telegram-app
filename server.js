function startGameLoop() {
    gameState.status = 'WAITING';
    gameState.multiplier = 1.00;
    gameState.bets = {};
    io.emit('game_state', { status: gameState.status, multiplier: 1.00 });

    setTimeout(() => {
        gameState.status = 'FLYING';
        gameState.crashPoint = generateCrashPoint();
        io.emit('game_started', { status: 'FLYING' });

        // SPEED SET TO 75ms (Smooth & Balanced Speed)
        let interval = setInterval(() => {
            gameState.multiplier = parseFloat((gameState.multiplier + 0.02).toFixed(2));
            io.emit('tick', { multiplier: gameState.multiplier });

            if (gameState.multiplier >= gameState.crashPoint) {
                clearInterval(interval);
                gameState.status = 'CRASHED';
                io.emit('crashed', { crashPoint: gameState.crashPoint });
                setTimeout(startGameLoop, 4000); 
            }
        }, 75); 
    }, 4000);
}
