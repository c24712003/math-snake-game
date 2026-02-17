// --- Game Configuration ---
const CONFIG = {
    gridSize: 40,
    cols: 20,
    rows: 15,
    colors: {
        snakeHead: '#22c55e', // Bright Green
        snakeBody: '#86efac', // Light Green
        food: '#f59e0b', // Orange (default)
        wall: '#94a3b8', // Gray
        text: '#1e293b' // Dark Text
    },
    baseSpeed: 400,
    speedDecrementPerLevel: 5,
    minSpeed: 60
};

// --- Game State ---
const state = {
    isRunning: false,
    level: 1,
    maxLevels: 20,
    lives: 3,
    score: 0, // Cumulative score
    levelSteps: 0, // Steps taken in current level
    currentValue: 0,
    targetValue: 0,
    grade: null,
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    foodItems: [],
    lastUpdate: 0,
    stepInterval: CONFIG.baseSpeed,
    particles: [], // For visual effects
    floatingTexts: [],
    isMuted: false // Mute state
};

// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (state.isMuted) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'eat':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'win':
            osc.type = 'triangle';
            // Arpeggio
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const t = now + i * 0.1;
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'square';
                o.frequency.value = freq;
                o.connect(g);
                g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.1, t);
                g.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                o.start(t);
                o.stop(t + 0.1);
            });
            break;
        case 'levelComplete':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.2);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'lose':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
            gainNode.gain.setValueAtTime(0.3, now);
            gainNode.gain.linearRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
            break;
    }
}

// --- DOM Elements ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const ui = {
    startScreen: document.getElementById('start-screen'),
    hud: document.getElementById('hud'),
    messageOverlay: document.getElementById('message-overlay'),
    messageTitle: document.getElementById('message-title'),
    messageBody: document.getElementById('message-body'),
    btnNext: document.getElementById('next-level-btn'),
    btnRestart: document.getElementById('restart-btn'),
    level: document.getElementById('level-value'),
    target: document.getElementById('target-value'),
    current: document.getElementById('current-value'),
    lives: document.getElementById('lives-value'),
    score: document.getElementById('score-value'),
    mobileControls: document.getElementById('mobile-controls')
};

// --- Initialization ---
// --- Initialization ---
function init() {
    // 1. Dynamic Grid Calculation
    function calculateGrid() {
        // Use Visual Viewport if available (mobile safe)
        const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;

        if (width < 850) {
            // Mobile Adjustment
            const hudEl = document.getElementById('hud');
            // Estimate HUD height if not visible (padding + 2 rows approx 120-140) + safe area
            const hudHeight = (hudEl && hudEl.offsetHeight > 0) ? hudEl.offsetHeight : 160;
            const safeAreaBuffer = 40;
            const horizontalPadding = 20;

            const availableW = width - horizontalPadding;
            const availableH = height - hudHeight - safeAreaBuffer;

            let targetSize = 40;

            // Determine cols/rows
            let cols = Math.floor(availableW / targetSize);
            let rows = Math.floor(availableH / targetSize);

            // Min constraints
            if (cols < 8) cols = 8;
            if (rows < 10) rows = 10;

            // Recalculate grid size
            const sizeW = Math.floor(availableW / cols);
            const sizeH = Math.floor(availableH / rows);

            CONFIG.gridSize = Math.min(sizeW, sizeH);
            if (CONFIG.gridSize > 45) CONFIG.gridSize = 45;

            CONFIG.cols = cols;
            CONFIG.rows = rows;
        } else {
            CONFIG.cols = 20;
            CONFIG.rows = 15;
            CONFIG.gridSize = 40;
        }

        canvas.width = CONFIG.cols * CONFIG.gridSize;
        canvas.height = CONFIG.rows * CONFIG.gridSize;

        // Sync CSS Grid Background
        const bgGrid = document.querySelector('.bg-grid');
        if (bgGrid) {
            bgGrid.style.backgroundSize = `${CONFIG.gridSize}px ${CONFIG.gridSize}px`;
            bgGrid.style.backgroundImage = `
                linear-gradient(var(--grid-color) 2px, transparent 2px),
                linear-gradient(90deg, var(--grid-color) 2px, transparent 2px)
            `;
        }
    }

    // Initial Setup
    calculateGrid();

    // Resize Handling
    let resizeTimeout;
    const onResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            calculateGrid();
            if (!state.isRunning) draw();
        }, 100);
    };
    window.addEventListener('resize', onResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onResize);
    }

    // Resume Audio Context on first interaction (Mobile Requirement)
    const resumeAudio = () => {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    };
    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('touchstart', resumeAudio, { once: true });

    // UI Event Listeners
    document.querySelectorAll('.grade-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            resumeAudio(); // Ensure resume on start
            startGame(e.target.dataset.grade);
        });
    });

    document.getElementById('next-level-btn').addEventListener('click', nextLevel);
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    document.getElementById('mute-btn').addEventListener('click', () => {
        state.isMuted = !state.isMuted;
        document.getElementById('mute-icon').textContent = state.isMuted ? '🔇' : '🔊';
        if (!state.isMuted) resumeAudio();
    });

    // Input Listeners
    document.addEventListener('keydown', handleInput);

    // Touch / Swipe Controls
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    const handleDirectionChange = (dx, dy) => {
        const newDir = { x: dx, y: dy };
        if (state.direction.x + newDir.x === 0 && state.direction.y + newDir.y === 0) return;
        if (state.direction.x + newDir.x !== 0 || state.direction.y + newDir.y !== 0) {
            state.nextDirection = newDir;
        }
    };

    if (btnUp) {
        const bindBtn = (btn, dx, dy) => {
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleDirectionChange(dx, dy); });
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); handleDirectionChange(dx, dy); });
        };
        bindBtn(btnUp, 0, -1);
        bindBtn(btnDown, 0, 1);
        bindBtn(btnLeft, -1, 0);
        bindBtn(btnRight, 1, 0);
    }

    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (e) => {
        // Prevent default scrolling on game area
        if (e.target.closest('#game-area') || e.target.closest('#mobile-controls') || e.target.closest('.overlay')) {
            if (e.target.tagName !== 'BUTTON') {
                e.preventDefault();
            }
        }
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (e.target.closest('#game-area') || e.target.closest('#mobile-controls')) {
            e.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!state.isRunning) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > 30) {
                handleDirectionChange(dx > 0 ? 1 : -1, 0);
            }
        } else {
            if (Math.abs(dy) > 30) {
                handleDirectionChange(0, dy > 0 ? 1 : -1);
            }
        }
    }, { passive: false });
}

// --- Core Logic ---

function startGame(grade) {
    state.grade = grade;
    state.level = 1;
    state.lives = 3;
    state.score = 0;

    ui.startScreen.classList.add('hidden');
    ui.startScreen.classList.add('hidden');
    ui.hud.classList.remove('hidden');

    // Mobile controls removed in favor of swipe gestures
    // if (window.innerWidth < 850) {
    //    ui.mobileControls.classList.remove('hidden');
    // }

    startLevel(state.level);

    state.isRunning = true;
    requestAnimationFrame(gameLoop);
}

function startLevel(level) {
    state.level = level;
    state.currentValue = 0;
    state.levelSteps = 0;
    // Calculate target based on level difficulty
    // Level 1: ~10-20. Level 20: ~100+.
    state.targetValue = 10 + (state.level * 4) + Math.floor(Math.random() * 5);

    // Spawn snake in the middle
    state.snake = [
        { x: Math.floor(CONFIG.cols / 2), y: Math.floor(CONFIG.rows / 2) },
        { x: Math.floor(CONFIG.cols / 2) - 1, y: Math.floor(CONFIG.rows / 2) },
        { x: Math.floor(CONFIG.cols / 2) - 2, y: Math.floor(CONFIG.rows / 2) }
    ];
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    // Speed increases every 4 levels
    const speedLevel = Math.floor((level - 1) / 4);
    state.stepInterval = Math.max(CONFIG.minSpeed, CONFIG.baseSpeed - (speedLevel * 20));

    state.foodItems = [];
    state.particles = [];

    // Spawn initial food
    spawnFood();
    spawnFood();
    spawnFood();

    updateHUD();
}

function getAvailableOperations() {
    let ops = ['+', '-'];
    if (state.grade === '3' || state.grade === '4') ops.push('*');
    if (state.grade === '4') ops.push('/');
    return ops;
}

function spawnFood() {
    let position;
    let safe = false;

    // Avoid spawning on snake or existing food
    let attempts = 0;
    while (!safe && attempts < 100) {
        position = {
            x: Math.floor(Math.random() * CONFIG.cols),
            y: Math.floor(Math.random() * CONFIG.rows)
        };
        safe = !isCollidingWithSnake(position) && !isCollidingWithFood(position);
        attempts++;
    }
    if (!safe) return; // Could not find spot

    const ops = getAvailableOperations();

    // Solvency Heuristic:
    // If current < target, prioritize + and *
    // If current > target, prioritize - and /
    // If current == 0, avoid * and / (since result is 0)

    let op = ops[Math.floor(Math.random() * ops.length)];
    let val = Math.floor(Math.random() * 9) + 1; // 1-9 default

    // Force '+' if 0 to avoid getting stuck
    if (state.currentValue === 0) {
        op = '+';
    } else {
        // Bias towards helping
        if (state.currentValue < state.targetValue && Math.random() < 0.6) {
            op = Math.random() < 0.7 ? '+' : (ops.includes('*') ? '*' : '+');
        } else if (state.currentValue > state.targetValue && Math.random() < 0.6) {
            op = Math.random() < 0.7 ? '-' : (ops.includes('/') ? '/' : '-');
        }
    }

    // Adjust values for multiply/divide to keep numbers reasonable
    if (op === '*') val = Math.floor(Math.random() * 3) + 2; // 2, 3, 4
    if (op === '/') val = 2; // Keep simple: /2 (maybe add 3 or 4 later)

    state.foodItems.push({
        x: position.x,
        y: position.y,
        op: op,
        val: val,
        text: `${op}${val}`,
        color: op === '+' || op === '*' ? '#10b981' : '#ef4444' // Green for add/mult, Red for sub/div (visual hint)
    });
}

function isCollidingWithSnake(pos) {
    return state.snake.some(segment => segment.x === pos.x && segment.y === pos.y);
}

function isCollidingWithFood(pos) {
    return state.foodItems.some(item => item.x === pos.x && item.y === pos.y);
}

function update(timestamp) {
    if (!state.isRunning) return;

    if (timestamp - state.lastUpdate > state.stepInterval) {
        state.direction = state.nextDirection;
        const head = { ...state.snake[0] };
        head.x += state.direction.x;
        head.y += state.direction.y;

        // Wall Collision
        if (head.x < 0 || head.x >= CONFIG.cols || head.y < 0 || head.y >= CONFIG.rows) {
            handleDeath();
            return;
        }

        // Self Collision
        if (isCollidingWithSnake(head)) {
            handleDeath();
            return;
        }

        // Food Collision
        const foodIndex = state.foodItems.findIndex(f => f.x === head.x && f.y === head.y);

        state.snake.unshift(head);

        if (foodIndex !== -1) {
            const food = state.foodItems[foodIndex];
            applyMath(food);

            // Visual Effect
            createElementExplosion(food.x * CONFIG.gridSize, food.y * CONFIG.gridSize, food.color);
            createFloatingText(food.x * CONFIG.gridSize, food.y * CONFIG.gridSize, food.text);
            playSound('eat');

            state.foodItems.splice(foodIndex, 1);
            spawnFood();

            // Snake grows (don't pop)
        } else {
            state.snake.pop();
        }

        checkWinCondition();
        state.lastUpdate = timestamp;
    }
}

function applyMath(food) {
    let oldVal = state.currentValue;
    switch (food.op) {
        case '+': state.currentValue += food.val; break;
        case '-': state.currentValue -= food.val; break;
        case '*': state.currentValue *= food.val; break;
        case '/': state.currentValue = Math.floor(state.currentValue / food.val); break;
    }
    // Prevent negative numbers (optional, but good for younger kids)
    if (state.currentValue < 0) state.currentValue = 0;

    // Base score for eating
    state.score += 10;
    state.levelSteps++; // Increment steps when eating food
    updateHUD();
}

function checkWinCondition() {
    if (state.currentValue === state.targetValue) {
        handleLevelComplete();
    }
}

function handleDeath() {
    state.lives--;
    updateHUD();
    playSound('lose');

    // Shake effect on canvas
    canvas.style.transform = "translateX(5px)";
    setTimeout(() => canvas.style.transform = "translateX(-5px)", 50);
    setTimeout(() => canvas.style.transform = "translateX(0)", 100);

    if (state.lives <= 0) {
        gameOver();
    } else {
        // Reset Logic
        state.snake = [
            { x: Math.floor(CONFIG.cols / 2), y: Math.floor(CONFIG.rows / 2) },
            { x: Math.floor(CONFIG.cols / 2) - 1, y: Math.floor(CONFIG.rows / 2) },
            { x: Math.floor(CONFIG.cols / 2) - 2, y: Math.floor(CONFIG.rows / 2) }
        ];
        state.direction = { x: 1, y: 0 };
        state.nextDirection = { x: 1, y: 0 };
        // Clear conflicting food
        state.foodItems = state.foodItems.filter(f => !isCollidingWithSnake(f));
        while (state.foodItems.length < 3) spawnFood();
    }
}

function handleLevelComplete() {
    state.isRunning = false;
    // Bonus score calculation
    // Efficiency Bonus: Fewer food items eaten = higher score
    // Max bonus 500, lose 50 points per food item eaten
    const stepBonus = Math.max(0, 500 - (state.levelSteps * 50));
    const livesBonus = state.lives * 100;
    const levelBonus = stepBonus + livesBonus;

    state.score += levelBonus;
    updateHUD();
    createConfetti();
    playSound('win');
    setTimeout(() => {
        showOverlay('過關啦！🎉', `目標是 ${state.targetValue}，你達成囉！\n獎勵分數: +${levelBonus} (走了 ${state.levelSteps} 步)`, false);
    }, 1000); // Delay for celebration
}

function gameOver() {
    state.isRunning = false;
    showOverlay('哎呀，沒關係！💪', `你在第 ${state.level} 關獲得 ${state.score} 分。\n多練習幾次，你一定可以的！`, true);
}

function nextLevel() {
    document.getElementById('message-overlay').classList.add('hidden');
    if (state.level < state.maxLevels) {
        startLevel(state.level + 1);
        state.isRunning = true;
        requestAnimationFrame(gameLoop);
    } else {
        showOverlay('太神啦！🏆', `全部 ${state.maxLevels} 關都破完了！\n你是超級數學小天才！\n總分: ${state.score} 🌟`, true);
        createConfetti();
    }
}

function restartGame() {
    document.getElementById('message-overlay').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

function showOverlay(title, body, isGameOver) {
    ui.messageTitle.innerText = title;
    ui.messageBody.innerText = body;
    ui.messageOverlay.classList.remove('hidden');

    if (isGameOver) {
        ui.btnNext.classList.add('hidden');
        ui.btnRestart.classList.remove('hidden');
    } else {
        ui.btnNext.classList.remove('hidden');
        ui.btnRestart.classList.add('hidden');
    }
}

// --- Visual Effects ---

function createFloatingText(x, y, text) {
    state.floatingTexts.push({
        x: x + CONFIG.gridSize / 2,
        y: y,
        text: text,
        life: 1.0,
        dy: -1 // Moves up
    });
}

function createElementExplosion(x, y, color) {
    for (let i = 0; i < 8; i++) {
        state.particles.push({
            x: x + CONFIG.gridSize / 2,
            y: y + CONFIG.gridSize / 2,
            vx: (Math.random() - 0.5) * (CONFIG.gridSize / 4),
            vy: (Math.random() - 0.5) * (CONFIG.gridSize / 4),
            life: 1.0,
            color: color
        });
    }
}

function createConfetti() {
    for (let i = 0; i < 100; i++) {
        state.particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * (CONFIG.gridSize / 2),
            vy: (Math.random() - 0.5) * (CONFIG.gridSize / 2),
            life: 2.0,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }
}

function updateParticles() {
    // Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Floating Texts
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        let ft = state.floatingTexts[i];
        ft.y += ft.dy;
        ft.life -= 0.02;
        if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }
}

function drawParticles() {
    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const r = CONFIG.gridSize * 0.1;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    state.floatingTexts.forEach(ft => {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = '#1e293b'; // Dark text for floaters
        const fontSize = Math.floor(CONFIG.gridSize * 0.6);
        ctx.font = `${fontSize}px "Varela Round"`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;
    });
}

function draw() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Food
    state.foodItems.forEach(food => {
        ctx.fillStyle = food.color || CONFIG.colors.food;
        const padding = CONFIG.gridSize * 0.05;
        const radius = CONFIG.gridSize * 0.2;
        drawRoundedRect(
            food.x * CONFIG.gridSize + padding,
            food.y * CONFIG.gridSize + padding,
            CONFIG.gridSize - (padding * 2),
            CONFIG.gridSize - (padding * 2),
            radius
        );


        ctx.fillStyle = '#ffffff';
        const fontSize = Math.floor(CONFIG.gridSize * 0.5);
        ctx.font = `${fontSize}px "Varela Round"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(food.text, food.x * CONFIG.gridSize + CONFIG.gridSize / 2, food.y * CONFIG.gridSize + CONFIG.gridSize / 2);
    });

    // Draw Snake
    state.snake.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? CONFIG.colors.snakeHead : CONFIG.colors.snakeBody;
        const padding = CONFIG.gridSize * 0.025;
        const radius = CONFIG.gridSize * 0.15;

        drawRoundedRect(
            segment.x * CONFIG.gridSize + padding,
            segment.y * CONFIG.gridSize + padding,
            CONFIG.gridSize - (padding * 2),
            CONFIG.gridSize - (padding * 2),
            radius
        );

        // Eyes for head
        if (index === 0) {
            ctx.fillStyle = 'white';
            const eyeOffset = CONFIG.gridSize * 0.2;
            const eyeSize = CONFIG.gridSize * 0.1;

            // Adjust eye position based on direction
            // Simple logic: fixed relative positions
            let lex = segment.x * CONFIG.gridSize + CONFIG.gridSize * 0.25;
            let ley = segment.y * CONFIG.gridSize + CONFIG.gridSize * 0.25;
            let rex = segment.x * CONFIG.gridSize + CONFIG.gridSize * 0.75;
            let rey = segment.y * CONFIG.gridSize + CONFIG.gridSize * 0.25;

            // rudimentary logic, can be improved
            ctx.beginPath(); ctx.arc(lex, ley, eyeSize, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(rex, rey, eyeSize, 0, Math.PI * 2); ctx.fill();
        }
    });

    // Draw Particles
    drawParticles();
}

function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function gameLoop(timestamp) {
    if (!state.isRunning) return;
    update(timestamp);
    updateParticles(); // Add particle update
    draw();
    requestAnimationFrame(gameLoop);
}

function handleInput(e) {
    switch (e.key) {
        case 'ArrowUp':
            if (state.direction.y === 0) state.nextDirection = { x: 0, y: -1 };
            break;
        case 'ArrowDown':
            if (state.direction.y === 0) state.nextDirection = { x: 0, y: 1 };
            break;
        case 'ArrowLeft':
            if (state.direction.x === 0) state.nextDirection = { x: -1, y: 0 };
            break;
        case 'ArrowRight':
            if (state.direction.x === 0) state.nextDirection = { x: 1, y: 0 };
            break;
    }
}

function updateHUD() {
    ui.level.innerText = state.level;
    ui.target.innerText = state.targetValue;
    ui.current.innerText = state.currentValue;
    ui.lives.innerText = '❤'.repeat(state.lives);
    ui.score.innerText = state.score;
}

// Start
init();
