// Ant Colony Game
// A mobile-friendly game where you play as a worker ant building and defending your colony

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();

        // Game state
        this.running = false;
        this.lastTime = 0;

        // World grid (tiles)
        this.tileSize = 20;
        this.worldWidth = 80;
        this.worldHeight = 60;
        this.tiles = [];

        // Camera
        this.camera = { x: 0, y: 0 };

        // Game objects
        this.player = null;
        this.queen = null;
        this.workers = [];
        this.enemies = [];
        this.foodSources = [];
        this.colonyFood = 0;

        // Visual effects
        this.particles = [];
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.ambientParticles = [];

        // Input
        this.keys = {};
        this.joystick = new Joystick();

        this.init();
    }

    setupCanvas() {
        const container = document.getElementById('game-container');
        const maxWidth = window.innerWidth - 4;
        const maxHeight = window.innerHeight - 4;

        // Maintain aspect ratio
        const aspectRatio = 16 / 9;
        let width = maxWidth;
        let height = width / aspectRatio;

        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }

        this.canvas.width = Math.min(800, width);
        this.canvas.height = Math.min(600, height);

        window.addEventListener('resize', () => this.setupCanvas());
    }

    init() {
        this.generateWorld();
        this.createColony();
        this.setupInput();
        this.start();
    }

    generateWorld() {
        // Track all spawn locations for fair food distribution
        this.spawnLocations = [];

        // Initialize world with dirt tiles
        for (let y = 0; y < this.worldHeight; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.worldWidth; x++) {
                const depth = y / this.worldHeight;
                // Sky at top, dirt underground
                if (y < 5) {
                    this.tiles[y][x] = { type: 'air', dug: true };
                } else {
                    this.tiles[y][x] = {
                        type: 'dirt',
                        dug: false,
                        hardness: 0.5 + depth * 0.5 // Deeper = harder
                    };
                }
            }
        }

        // Generate natural caves using cellular automata
        this.generateCaves();

        // Create initial colony chamber
        const startX = Math.floor(this.worldWidth / 2);
        const startY = 10;

        for (let y = startY; y < startY + 4; y++) {
            for (let x = startX - 3; x < startX + 4; x++) {
                if (this.isValidTile(x, y)) {
                    this.tiles[y][x].dug = true;
                    this.tiles[y][x].type = 'air';
                }
            }
        }

        // Track player spawn location
        this.spawnLocations.push({ x: startX, y: startY });

        // Spawn enemy nests BEFORE food
        this.spawnEnemyNests(3);

        // Spawn food sources with distance checks from all spawn points
        this.spawnFoodSources(5);
    }

    generateCaves() {
        // Create cave generation map (start with random noise)
        const caveMap = [];
        const fillProbability = 0.52; // Initial cave density - increased for more caves

        // Initialize cave map with random tiles
        for (let y = 0; y < this.worldHeight; y++) {
            caveMap[y] = [];
            for (let x = 0; x < this.worldWidth; x++) {
                // Only generate caves in underground area (below y = 5)
                // Leave some border space
                if (y >= 8 && y < this.worldHeight - 3 && x >= 3 && x < this.worldWidth - 3) {
                    // Use seeded random for consistent generation across regions
                    const seed = (x + y * this.worldWidth);
                    const pseudo = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
                    const randomValue = pseudo - Math.floor(pseudo);
                    caveMap[y][x] = randomValue < fillProbability ? 1 : 0;
                } else {
                    caveMap[y][x] = 0; // No caves in borders/surface
                }
            }
        }

        // Apply cellular automata rules to smooth caves
        // More iterations = smoother, more connected caves
        for (let iteration = 0; iteration < 3; iteration++) {
            const newMap = [];

            for (let y = 0; y < this.worldHeight; y++) {
                newMap[y] = [];
                for (let x = 0; x < this.worldWidth; x++) {
                    // Count alive neighbors
                    const neighbors = this.countCaveNeighbors(caveMap, x, y);

                    // Cellular automata rules - adjusted to keep more caves
                    // If 4 or more neighbors are caves, this becomes a cave
                    // If 3 or fewer neighbors are caves, this becomes solid
                    if (neighbors >= 4) {
                        newMap[y][x] = 1;
                    } else if (neighbors <= 2) {
                        newMap[y][x] = 0;
                    } else {
                        newMap[y][x] = caveMap[y][x]; // Keep current state
                    }
                }
            }

            // Copy new map to cave map for next iteration
            for (let y = 0; y < this.worldHeight; y++) {
                for (let x = 0; x < this.worldWidth; x++) {
                    caveMap[y][x] = newMap[y][x];
                }
            }
        }

        // Apply cave map to actual world tiles
        for (let y = 0; y < this.worldHeight; y++) {
            for (let x = 0; x < this.worldWidth; x++) {
                if (caveMap[y][x] === 1) {
                    this.tiles[y][x].dug = true;
                    this.tiles[y][x].type = 'air';
                }
            }
        }
    }

    countCaveNeighbors(map, x, y) {
        let count = 0;

        // Check 8 surrounding tiles plus further neighbors for smoother caves
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                if (ny >= 0 && ny < this.worldHeight && nx >= 0 && nx < this.worldWidth) {
                    count += map[ny][nx];
                } else {
                    // Treat out of bounds as solid (helps prevent edge caves)
                    count += 0;
                }
            }
        }

        return count;
    }

    spawnFoodSources(count) {
        // Spawn food in random cave locations for fair distribution
        const minDistanceFromSpawn = 10; // Minimum distance from any spawn point

        for (let i = 0; i < count; i++) {
            let x, y;
            let attempts = 0;
            const maxAttempts = 200;
            let validLocation = false;

            // Find a cave tile to spawn food in, away from all spawn points
            do {
                x = 5 + Math.random() * (this.worldWidth - 10);
                y = 10 + Math.random() * (this.worldHeight - 15);
                attempts++;

                // Check if this is a cave tile
                if (!this.getTile(x, y)?.dug) {
                    continue;
                }

                // Check distance from all spawn locations
                validLocation = true;
                for (let spawn of this.spawnLocations) {
                    const dx = spawn.x - x;
                    const dy = spawn.y - y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < minDistanceFromSpawn) {
                        validLocation = false;
                        break;
                    }
                }
            } while (attempts < maxAttempts && !validLocation);

            // If we found a valid cave location away from spawns, spawn food there
            if (validLocation) {
                const amount = 50 + Math.floor(Math.random() * 100);
                this.foodSources.push(new FoodSource(x, y, amount));
            }
        }
    }

    spawnEnemyNests(count) {
        for (let i = 0; i < count; i++) {
            const x = 10 + Math.random() * (this.worldWidth - 20);
            const y = 15 + Math.random() * (this.worldHeight - 25);

            // Track this enemy nest spawn location
            this.spawnLocations.push({ x: x, y: y });

            // Create a small chamber
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const tx = Math.floor(x + dx);
                    const ty = Math.floor(y + dy);
                    if (this.isValidTile(tx, ty)) {
                        this.tiles[ty][tx].dug = true;
                        this.tiles[ty][tx].type = 'air';
                    }
                }
            }

            // Spawn enemy ants
            for (let j = 0; j < 2 + Math.floor(Math.random() * 3); j++) {
                this.enemies.push(new EnemyAnt(
                    x + (Math.random() - 0.5) * 3,
                    y + (Math.random() - 0.5) * 3,
                    x, y, 2 // nest position and radius
                ));
            }
        }
    }

    createColony() {
        const startX = this.worldWidth / 2;
        const startY = 12;

        // Create queen
        this.queen = new Queen(startX, startY);

        // Create player-controlled worker
        this.player = new WorkerAnt(startX + 1, startY, true);

        // Camera follows player
        this.updateCamera();
    }

    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Prevent arrow key scrolling
        window.addEventListener('keydown', (e) => {
            if(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }
        });
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    gameLoop = (currentTime) => {
        if (!this.running) return;

        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(Math.min(deltaTime, 0.1)); // Cap delta time
        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    update(dt) {
        // Handle input
        const input = this.getInput();

        // Update player
        if (this.player && this.player.alive) {
            this.player.update(dt, input, this);
        } else if (!this.player.alive) {
            // Game over
            this.running = false;
            alert('Your ant died! Game Over. Refresh to play again.');
        }

        // Update queen
        if (this.queen) {
            this.queen.update(dt, this);
        }

        // Update AI workers
        this.workers.forEach(worker => worker.update(dt, {}, this));

        // Update enemies
        this.enemies.forEach(enemy => enemy.update(dt, {}, this));

        // Remove dead enemies
        this.enemies = this.enemies.filter(e => e.alive);

        // Remove depleted food sources
        this.foodSources = this.foodSources.filter(f => f.amount > 0);

        // Update particles
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => p.life > 0);

        // Update ambient particles
        this.updateAmbientParticles(dt);

        // Update screen shake
        if (this.screenShake.intensity > 0) {
            this.screenShake.intensity *= 0.9;
            if (this.screenShake.intensity < 0.01) this.screenShake.intensity = 0;
        }

        // Update camera
        this.updateCamera();

        // Update UI
        this.updateUI();
    }

    getInput() {
        const input = { x: 0, y: 0 };

        // Keyboard input
        if (this.keys['arrowleft'] || this.keys['a']) input.x -= 1;
        if (this.keys['arrowright'] || this.keys['d']) input.x += 1;
        if (this.keys['arrowup'] || this.keys['w']) input.y -= 1;
        if (this.keys['arrowdown'] || this.keys['s']) input.y += 1;

        // Joystick input (mobile)
        const joyInput = this.joystick.getInput();
        if (Math.abs(joyInput.x) > 0.1 || Math.abs(joyInput.y) > 0.1) {
            input.x = joyInput.x;
            input.y = joyInput.y;
        }

        // Normalize diagonal movement
        if (input.x !== 0 && input.y !== 0) {
            const length = Math.sqrt(input.x * input.x + input.y * input.y);
            input.x /= length;
            input.y /= length;
        }

        return input;
    }

    updateCamera() {
        if (!this.player) return;

        const targetX = this.player.x * this.tileSize - this.canvas.width / 2;
        const targetY = this.player.y * this.tileSize - this.canvas.height / 2;

        // Smooth camera follow
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;

        // Add screen shake
        if (this.screenShake.intensity > 0) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }

        // Clamp camera to world bounds
        this.camera.x = Math.max(0, Math.min(this.camera.x,
            this.worldWidth * this.tileSize - this.canvas.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y,
            this.worldHeight * this.tileSize - this.canvas.height));
    }

    updateUI() {
        document.getElementById('food-count').textContent = this.colonyFood;
        document.getElementById('worker-count').textContent =
            1 + this.workers.length; // +1 for player
        document.getElementById('health').textContent =
            this.player ? Math.ceil(this.player.health) : 0;
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate visible tile range
        const startX = Math.floor(this.camera.x / this.tileSize);
        const startY = Math.floor(this.camera.y / this.tileSize);
        const endX = Math.ceil((this.camera.x + this.canvas.width) / this.tileSize);
        const endY = Math.ceil((this.camera.y + this.canvas.height) / this.tileSize);

        // Render tiles
        for (let y = Math.max(0, startY); y < Math.min(this.worldHeight, endY + 1); y++) {
            for (let x = Math.max(0, startX); x < Math.min(this.worldWidth, endX + 1); x++) {
                this.renderTile(x, y);
            }
        }

        // Render food sources
        this.foodSources.forEach(food => food.render(ctx, this.camera, this.tileSize));

        // Render queen
        if (this.queen) {
            this.queen.render(ctx, this.camera, this.tileSize, this);
        }

        // Render workers
        this.workers.forEach(worker => worker.render(ctx, this.camera, this.tileSize, this));

        // Render enemies
        this.enemies.forEach(enemy => enemy.render(ctx, this.camera, this.tileSize, this));

        // Render player
        if (this.player) {
            this.player.render(ctx, this.camera, this.tileSize, this);
        }

        // Render particles
        this.particles.forEach(p => p.render(ctx, this.camera, this.tileSize));
    }

    renderTile(x, y) {
        const tile = this.tiles[y][x];
        const screenX = x * this.tileSize - this.camera.x + this.screenShake.x;
        const screenY = y * this.tileSize - this.camera.y + this.screenShake.y;

        if (tile.dug || tile.type === 'air') {
            // Air/dug tunnel with slight variation
            const variation = (x * 13 + y * 17) % 10;
            const darkness = 10 + variation;
            this.ctx.fillStyle = `rgb(${darkness}, ${darkness * 0.5}, ${darkness * 0.5})`;
            this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

            // Add tunnel edges glow
            if (!this.getTile(x-1, y)?.dug || !this.getTile(x+1, y)?.dug ||
                !this.getTile(x, y-1)?.dug || !this.getTile(x, y+1)?.dug) {
                this.ctx.fillStyle = 'rgba(40, 20, 10, 0.3)';
                this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
            }
        } else {
            // Dirt with procedural texture
            const depth = y / this.worldHeight;
            const brown = Math.floor(60 + depth * 40);
            const baseColor = `rgb(${brown}, ${brown * 0.5}, ${brown * 0.3})`;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

            // Procedural noise texture
            const seed = x * 73 + y * 37;
            for (let i = 0; i < 3; i++) {
                const noiseX = ((seed + i * 23) % this.tileSize);
                const noiseY = ((seed * 2 + i * 17) % this.tileSize);
                const size = 2 + (seed % 3);
                const opacity = 0.1 + ((seed + i) % 10) / 100;

                this.ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
                this.ctx.fillRect(screenX + noiseX, screenY + noiseY, size, size);
            }

            // Digging progress indicator
            if (tile.digProgress && tile.digProgress > 0) {
                const progress = tile.digProgress / tile.hardness;
                this.ctx.fillStyle = `rgba(80, 60, 40, ${progress * 0.5})`;
                this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

                // Cracks
                if (progress > 0.3) {
                    this.ctx.strokeStyle = `rgba(40, 30, 20, ${progress})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(screenX + 2, screenY + 5);
                    this.ctx.lineTo(screenX + this.tileSize - 2, screenY + this.tileSize - 5);
                    this.ctx.stroke();
                }
            }
        }
    }

    getTile(x, y) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (this.isValidTile(tx, ty)) {
            return this.tiles[ty][tx];
        }
        return null;
    }

    isValidTile(x, y) {
        return x >= 0 && x < this.worldWidth && y >= 0 && y < this.worldHeight;
    }

    canMove(x, y) {
        const tile = this.getTile(x, y);
        return tile && (tile.dug || tile.type === 'air');
    }

    digTile(x, y, digPower = 1) {
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (this.isValidTile(tx, ty)) {
            const tile = this.tiles[ty][tx];
            if (!tile.dug && tile.type === 'dirt') {
                tile.digProgress = (tile.digProgress || 0) + digPower;

                // Spawn digging particles
                if (Math.random() < 0.3) {
                    this.spawnDigParticles(tx + 0.5, ty + 0.5);
                }

                if (tile.digProgress >= tile.hardness) {
                    tile.dug = true;
                    tile.type = 'air';
                    // Spawn burst of particles
                    this.spawnDigBurst(tx + 0.5, ty + 0.5);
                    return true;
                }
            }
        }
        return false;
    }

    spawnDigParticles(x, y) {
        for (let i = 0; i < 2; i++) {
            this.particles.push(new Particle(
                x, y,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                '#8B4513',
                0.3 + Math.random() * 0.3,
                2 + Math.random() * 2
            ));
        }
    }

    spawnDigBurst(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 1 + Math.random() * 2;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                Math.random() < 0.5 ? '#8B4513' : '#A0522D',
                0.5 + Math.random() * 0.5,
                3 + Math.random() * 3
            ));
        }
    }

    spawnFoodParticles(x, y) {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1,
                Math.random() < 0.5 ? '#FFD700' : '#FFA500',
                0.8 + Math.random() * 0.4,
                4 + Math.random() * 3,
                'sparkle'
            ));
        }
    }

    spawnHitParticles(x, y) {
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 2;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                '#FF0000',
                0.3 + Math.random() * 0.2,
                3 + Math.random() * 2
            ));
        }
        this.screenShake.intensity = 5;
    }

    updateAmbientParticles(dt) {
        // Spawn ambient dust particles in tunnels near player
        if (this.player && Math.random() < 0.1) {
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 15;
            const x = this.player.x + offsetX;
            const y = this.player.y + offsetY;

            if (this.getTile(x, y)?.dug) {
                this.particles.push(new Particle(
                    x, y,
                    (Math.random() - 0.5) * 0.3,
                    -0.1 - Math.random() * 0.2,
                    'rgba(200, 180, 150, 0.3)',
                    2 + Math.random() * 3,
                    1 + Math.random(),
                    'dust'
                ));
            }
        }
    }

    addFood(amount) {
        this.colonyFood += amount;
    }

    spawnWorker() {
        if (this.queen) {
            this.workers.push(new WorkerAnt(
                this.queen.x + (Math.random() - 0.5),
                this.queen.y + (Math.random() - 0.5),
                false
            ));
        }
    }
}

class Joystick {
    constructor() {
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.active = false;
        this.x = 0;
        this.y = 0;

        this.setupEvents();
    }

    setupEvents() {
        const startTouch = (e) => {
            e.preventDefault();
            this.active = true;
        };

        const moveTouch = (e) => {
            if (!this.active) return;
            e.preventDefault();

            const touch = e.touches[0];
            const rect = this.base.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            let dx = touch.clientX - centerX;
            let dy = touch.clientY - centerY;

            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = rect.width / 2 - 10;

            if (distance > maxDistance) {
                dx = dx / distance * maxDistance;
                dy = dy / distance * maxDistance;
            }

            this.x = dx / maxDistance;
            this.y = dy / maxDistance;

            this.stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        };

        const endTouch = (e) => {
            e.preventDefault();
            this.active = false;
            this.x = 0;
            this.y = 0;
            this.stick.style.transform = 'translate(-50%, -50%)';
        };

        this.base.addEventListener('touchstart', startTouch);
        this.base.addEventListener('touchmove', moveTouch);
        this.base.addEventListener('touchend', endTouch);

        // Mouse events for testing on desktop
        this.base.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.active = true;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.active) return;

            const rect = this.base.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            let dx = e.clientX - centerX;
            let dy = e.clientY - centerY;

            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = rect.width / 2 - 10;

            if (distance > maxDistance) {
                dx = dx / distance * maxDistance;
                dy = dy / distance * maxDistance;
            }

            this.x = dx / maxDistance;
            this.y = dy / maxDistance;

            this.stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        });

        window.addEventListener('mouseup', endTouch);
    }

    getInput() {
        return { x: this.x, y: this.y };
    }
}

class Ant {
    constructor(x, y, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.isPlayer = isPlayer;
        this.speed = 3;
        this.health = 100;
        this.maxHealth = 100;
        this.alive = true;
        this.size = 0.4;
        this.color = '#000';
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
        }
    }

    render(ctx, camera, tileSize, game = null) {
        if (!this.alive) return;

        const shakeX = game ? game.screenShake.x : 0;
        const shakeY = game ? game.screenShake.y : 0;
        const screenX = this.x * tileSize - camera.x + shakeX;
        const screenY = this.y * tileSize - camera.y + shakeY;
        const size = this.size * tileSize;

        // Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.6, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.3, size * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX - size * 0.2, screenY - size * 0.5);
        ctx.lineTo(screenX - size * 0.4, screenY - size * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenX + size * 0.2, screenY - size * 0.5);
        ctx.lineTo(screenX + size * 0.4, screenY - size * 0.8);
        ctx.stroke();

        // Health bar
        if (this.health < this.maxHealth || this.isPlayer) {
            const barWidth = size * 2;
            const barHeight = 3;
            const barX = screenX - barWidth / 2;
            const barY = screenY - size - 5;

            ctx.fillStyle = '#f00';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }

        // Player indicator
        if (this.isPlayer) {
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, size * 1.5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

class WorkerAnt extends Ant {
    constructor(x, y, isPlayer = false) {
        super(x, y, isPlayer);
        this.color = '#2a1a0a';
        this.carryingFood = false;
        this.foodAmount = 0;
        this.targetFood = null;
        this.state = 'idle'; // idle, seeking, carrying, fighting
        this.digCooldown = 0;
        this.attackCooldown = 0;
        this.stateTimer = 0;
    }

    update(dt, input, game) {
        if (!this.alive) return;

        this.digCooldown = Math.max(0, this.digCooldown - dt);
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.stateTimer -= dt;

        if (this.isPlayer) {
            this.updatePlayer(dt, input, game);
        } else {
            this.updateAI(dt, game);
        }

        // Check for enemy collisions
        this.checkCombat(dt, game);
    }

    updatePlayer(dt, input, game) {
        // Movement and digging
        if (input.x !== 0 || input.y !== 0) {
            const newX = this.x + input.x * this.speed * dt;
            const newY = this.y + input.y * this.speed * dt;

            if (game.canMove(newX, newY)) {
                this.x = newX;
                this.y = newY;
            } else {
                // Try to dig
                if (this.digCooldown === 0) {
                    const digX = this.x + input.x * 0.5;
                    const digY = this.y + input.y * 0.5;
                    if (game.digTile(digX, digY, dt * 2)) {
                        this.digCooldown = 0.1;
                    }
                }
            }
        }

        // Pick up food
        if (!this.carryingFood) {
            for (let food of game.foodSources) {
                const dx = food.x - this.x;
                const dy = food.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 1 && food.amount > 0) {
                    const taken = Math.min(10, food.amount);
                    food.amount -= taken;
                    this.foodAmount = taken;
                    this.carryingFood = true;
                    game.spawnFoodParticles(this.x, this.y);
                    break;
                }
            }
        }

        // Deliver food to queen
        if (this.carryingFood && game.queen) {
            const dx = game.queen.x - this.x;
            const dy = game.queen.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 1.5) {
                game.addFood(this.foodAmount);
                this.foodAmount = 0;
                this.carryingFood = false;
            }
        }
    }

    updateAI(dt, game) {
        // Simple AI behavior
        if (this.carryingFood) {
            // Return to queen
            this.moveTowards(game.queen.x, game.queen.y, dt, game);

            const dx = game.queen.x - this.x;
            const dy = game.queen.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 1.5) {
                game.addFood(this.foodAmount);
                this.foodAmount = 0;
                this.carryingFood = false;
                this.targetFood = null;
                this.state = 'idle';
            }
        } else {
            // Find food
            if (!this.targetFood || this.targetFood.amount === 0) {
                // Find nearest food
                let nearest = null;
                let nearestDist = Infinity;

                for (let food of game.foodSources) {
                    if (food.amount > 0) {
                        const dx = food.x - this.x;
                        const dy = food.y - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearest = food;
                        }
                    }
                }

                this.targetFood = nearest;
            }

            if (this.targetFood) {
                this.moveTowards(this.targetFood.x, this.targetFood.y, dt, game);

                const dx = this.targetFood.x - this.x;
                const dy = this.targetFood.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 1 && this.targetFood.amount > 0) {
                    const taken = Math.min(10, this.targetFood.amount);
                    this.targetFood.amount -= taken;
                    this.foodAmount = taken;
                    this.carryingFood = true;
                    this.state = 'carrying';
                    game.spawnFoodParticles(this.x, this.y);
                }
            } else {
                // Wander
                if (this.stateTimer <= 0) {
                    this.wanderX = this.x + (Math.random() - 0.5) * 5;
                    this.wanderY = this.y + (Math.random() - 0.5) * 5;
                    this.stateTimer = 3;
                }
                this.moveTowards(this.wanderX, this.wanderY, dt, game);
            }
        }
    }

    moveTowards(targetX, targetY, dt, game) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
            const dirX = dx / dist;
            const dirY = dy / dist;

            const newX = this.x + dirX * this.speed * dt;
            const newY = this.y + dirY * this.speed * dt;

            if (game.canMove(newX, newY)) {
                this.x = newX;
                this.y = newY;
            } else {
                // Try to dig
                if (this.digCooldown === 0) {
                    if (game.digTile(this.x + dirX * 0.5, this.y + dirY * 0.5, dt)) {
                        this.digCooldown = 0.2;
                    }
                }
            }
        }
    }

    checkCombat(dt, game) {
        for (let enemy of game.enemies) {
            if (!enemy.alive) continue;

            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.8) {
                // Attack
                if (this.attackCooldown === 0) {
                    enemy.takeDamage(10);
                    this.attackCooldown = 1;
                    game.spawnHitParticles(enemy.x, enemy.y);
                }
            }
        }
    }

    render(ctx, camera, tileSize, game = null) {
        super.render(ctx, camera, tileSize, game);

        // Draw food if carrying
        if (this.carryingFood) {
            const shakeX = game ? game.screenShake.x : 0;
            const shakeY = game ? game.screenShake.y : 0;
            const screenX = this.x * tileSize - camera.x + shakeX;
            const screenY = this.y * tileSize - camera.y + shakeY;

            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(screenX, screenY - tileSize * 0.3, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Queen extends Ant {
    constructor(x, y) {
        super(x, y, false);
        this.color = '#4a2a0a';
        this.size = 0.8;
        this.maxHealth = 200;
        this.health = 200;
        this.spawnTimer = 0;
        this.spawnCooldown = 10; // seconds per worker
        this.foodPerWorker = 20;
    }

    update(dt, game) {
        this.spawnTimer += dt;

        // Spawn new workers if we have food
        if (this.spawnTimer >= this.spawnCooldown && game.colonyFood >= this.foodPerWorker) {
            game.colonyFood -= this.foodPerWorker;
            game.spawnWorker();
            this.spawnTimer = 0;
        }
    }

    render(ctx, camera, tileSize, game = null) {
        const shakeX = game ? game.screenShake.x : 0;
        const shakeY = game ? game.screenShake.y : 0;
        const screenX = this.x * tileSize - camera.x + shakeX;
        const screenY = this.y * tileSize - camera.y + shakeY;
        const size = this.size * tileSize;

        // Large body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.4, size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Crown indicator
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.7, size * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // Health bar
        const barWidth = size * 2;
        const barHeight = 4;
        const barX = screenX - barWidth / 2;
        const barY = screenY - size - 8;

        ctx.fillStyle = '#f00';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
    }
}

class EnemyAnt extends Ant {
    constructor(x, y, nestX, nestY, nestRadius) {
        super(x, y, false);
        this.color = '#8b0000';
        this.nestX = nestX;
        this.nestY = nestY;
        this.nestRadius = nestRadius;
        this.aggroRange = 5;
        this.attackRange = 0.8;
        this.attackCooldown = 0;
        this.target = null;
        this.wanderTimer = 0;
        this.wanderX = x;
        this.wanderY = y;
    }

    update(dt, input, game) {
        if (!this.alive) return;

        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.wanderTimer -= dt;

        // Find nearest friendly ant
        let nearest = null;
        let nearestDist = Infinity;

        // Check player
        if (game.player && game.player.alive) {
            const dx = game.player.x - this.x;
            const dy = game.player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.aggroRange && dist < nearestDist) {
                nearestDist = dist;
                nearest = game.player;
            }
        }

        // Check workers
        for (let worker of game.workers) {
            if (!worker.alive) continue;

            const dx = worker.x - this.x;
            const dy = worker.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.aggroRange && dist < nearestDist) {
                nearestDist = dist;
                nearest = worker;
            }
        }

        // Check queen
        if (game.queen) {
            const dx = game.queen.x - this.x;
            const dy = game.queen.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.aggroRange * 1.5 && dist < nearestDist) {
                nearestDist = dist;
                nearest = game.queen;
            }
        }

        if (nearest) {
            // Attack mode
            this.target = nearest;
            this.moveTowards(nearest.x, nearest.y, dt, game);

            if (nearestDist < this.attackRange && this.attackCooldown === 0) {
                nearest.takeDamage(5);
                this.attackCooldown = 1;
                game.spawnHitParticles(nearest.x, nearest.y);
            }
        } else {
            // Patrol near nest
            const dx = this.nestX - this.x;
            const dy = this.nestY - this.y;
            const distFromNest = Math.sqrt(dx * dx + dy * dy);

            if (distFromNest > this.nestRadius * 2) {
                // Return to nest
                this.moveTowards(this.nestX, this.nestY, dt, game);
            } else {
                // Wander
                if (this.wanderTimer <= 0) {
                    const angle = Math.random() * Math.PI * 2;
                    this.wanderX = this.nestX + Math.cos(angle) * this.nestRadius;
                    this.wanderY = this.nestY + Math.sin(angle) * this.nestRadius;
                    this.wanderTimer = 3 + Math.random() * 2;
                }
                this.moveTowards(this.wanderX, this.wanderY, dt, game);
            }
        }
    }

    moveTowards(targetX, targetY, dt, game) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
            const dirX = dx / dist;
            const dirY = dy / dist;

            const newX = this.x + dirX * this.speed * dt;
            const newY = this.y + dirY * this.speed * dt;

            if (game.canMove(newX, newY)) {
                this.x = newX;
                this.y = newY;
            }
        }
    }
}

class FoodSource {
    constructor(x, y, amount) {
        this.x = x;
        this.y = y;
        this.amount = amount;
        this.maxAmount = amount;
        this.pulseTimer = Math.random() * Math.PI * 2;
    }

    render(ctx, camera, tileSize, game = null) {
        if (this.amount <= 0) return;

        const screenX = this.x * tileSize - camera.x;
        const screenY = this.y * tileSize - camera.y;

        // Draw food blob with pulse effect
        this.pulseTimer += 0.05;
        const pulse = Math.sin(this.pulseTimer) * 0.1 + 1;
        const radius = (5 + (this.amount / this.maxAmount) * 10) * pulse;

        // Glow
        const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius * 1.5);
        gradient.addColorStop(0, 'rgba(255, 235, 59, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 235, 59, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Main blob
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffa000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Amount text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.amount, screenX, screenY);
    }
}

class Particle {
    constructor(x, y, vx, vy, color, life, size, type = 'default') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.type = type;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        // Gravity for non-dust particles
        if (this.type !== 'dust') {
            this.vy += 5 * dt;
        }

        // Friction
        this.vx *= 0.98;
        this.vy *= 0.98;

        this.rotation += this.rotationSpeed;
    }

    render(ctx, camera, tileSize) {
        if (this.life <= 0) return;

        const screenX = this.x * tileSize - camera.x;
        const screenY = this.y * tileSize - camera.y;

        const alpha = Math.min(1, this.life / this.maxLife);

        ctx.save();
        ctx.globalAlpha = alpha;

        if (this.type === 'sparkle') {
            // Star sparkle effect
            ctx.translate(screenX, screenY);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                const x = Math.cos(angle) * this.size;
                const y = Math.sin(angle) * this.size;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);

                const innerAngle = angle + Math.PI / 5;
                const ix = Math.cos(innerAngle) * this.size * 0.4;
                const iy = Math.sin(innerAngle) * this.size * 0.4;
                ctx.lineTo(ix, iy);
            }
            ctx.closePath();
            ctx.fill();

            // Glow
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'dust') {
            // Soft dust particle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Default dirt particle
            ctx.translate(screenX, screenY);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        }

        ctx.restore();
    }
}

// Start the game
window.addEventListener('load', () => {
    new Game();
});
