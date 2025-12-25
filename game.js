// Ant Colony Game
// A mobile-friendly game where you play as a worker ant building and defending your colony

class Colony {
    constructor(factionId, queenX, queenY, isPlayer = false) {
        this.factionId = factionId; // Unique faction identifier
        this.isPlayer = isPlayer;
        this.queen = null;
        this.workers = [];
        this.food = 0;

        // Assign colors based on faction
        const colors = [
            { worker: '#8B4513', queen: '#4a2a0a', name: 'Brown' }, // Player - brown
            { worker: '#FF0000', queen: '#8B0000', name: 'Red' },    // Enemy 1 - red
            { worker: '#FF6600', queen: '#CC5200', name: 'Orange' }, // Enemy 2 - orange
            { worker: '#CC00CC', queen: '#990099', name: 'Purple' }, // Enemy 3 - purple
            { worker: '#00CCCC', queen: '#008B8B', name: 'Cyan' }    // Enemy 4 - cyan
        ];

        this.colors = colors[factionId % colors.length];
        this.queenX = queenX;
        this.queenY = queenY;
    }

    createQueen(x, y) {
        this.queen = new Queen(x, y, this);
        this.queen.color = this.colors.queen;
        return this.queen;
    }

    addWorker(worker) {
        worker.colony = this;
        worker.color = this.colors.worker;
        this.workers.push(worker);
    }

    spawnWorker(game) {
        if (!this.queen || !this.queen.alive) return;

        // Try to spawn in a valid location near queen
        let spawnX = this.queen.x;
        let spawnY = this.queen.y;

        for (let attempt = 0; attempt < 10; attempt++) {
            const testX = this.queen.x + (Math.random() - 0.5) * 2;
            const testY = this.queen.y + (Math.random() - 0.5) * 2;

            if (game.canMove(testX, testY)) {
                spawnX = testX;
                spawnY = testY;
                break;
            }
        }

        const newWorker = new WorkerAnt(spawnX, spawnY, false);
        this.addWorker(newWorker);
        console.log(`${this.colors.name} colony spawned worker! Total: ${this.workers.length}`);
    }

    update(dt, game) {
        // Update queen
        if (this.queen && this.queen.alive) {
            this.queen.update(dt, game);
        }

        // Update workers (skip player - they're updated separately in game.update())
        this.workers.forEach(worker => {
            if (!worker.isPlayer) {
                worker.update(dt, {}, game);
            }
        });

        // Remove dead workers
        const before = this.workers.length;
        this.workers = this.workers.filter(w => w.alive);
        if (this.workers.length < before) {
            console.log(`${this.colors.name} worker died! Remaining: ${this.workers.length}`);
        }
    }

    render(ctx, camera, tileSize, game) {
        // Render queen
        if (this.queen && this.queen.alive) {
            this.queen.render(ctx, camera, tileSize, game);
        }

        // Render workers
        this.workers.forEach(worker => worker.render(ctx, camera, tileSize, game));
    }
}

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
        this.worldWidth = 400;
        this.worldHeight = 300;
        this.tiles = [];

        // Camera
        this.camera = { x: 0, y: 0 };

        // Game objects
        this.player = null;
        this.colonies = []; // Array of Colony objects (player colony + enemy colonies)
        this.enemies = []; // Array of EnemyAnt instances spawned by enemy queens
        this.foodSources = [];

        // Visual effects
        this.particles = [];
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.ambientParticles = [];

        // Input
        this.keys = {};
        this.joystick = new Joystick();
        this.joystick.game = this; // Connect joystick to game

        this.init();
        this.setupFactionsMenu();
    }

    setupFactionsMenu() {
        const toggleButton = document.getElementById('factions-toggle');
        const content = document.getElementById('factions-content');

        if (toggleButton && content) {
            toggleButton.addEventListener('click', () => {
                const isCollapsed = content.classList.contains('collapsed');
                if (isCollapsed) {
                    content.classList.remove('collapsed');
                    toggleButton.textContent = 'Factions ▲';
                } else {
                    content.classList.add('collapsed');
                    toggleButton.textContent = 'Factions ▼';
                }
            });
        }
    }

    setupCanvas() {
        const container = document.getElementById('game-container');

        // Detect if mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                         || window.innerWidth < 768;

        if (isMobile) {
            // Full viewport on mobile - no padding
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        } else {
            // Desktop: maintain aspect ratio with some padding
            const maxWidth = window.innerWidth - 20;
            const maxHeight = window.innerHeight - 20;
            const aspectRatio = 16 / 9;
            let width = maxWidth;
            let height = width / aspectRatio;

            if (height > maxHeight) {
                height = maxHeight;
                width = height * aspectRatio;
            }

            this.canvas.width = Math.min(1600, width);
            this.canvas.height = Math.min(900, height);
        }

        window.addEventListener('resize', () => this.setupCanvas());
    }

    init() {
        this.generateWorld();
        this.createColony();
        this.setupInput();
        this.start();
    }

    generateWorld() {
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

        // Generate cave systems using cellular automata
        this.generateCaveSystems();

        // Create initial colony chamber (small starting area)
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

        // Spawn food sources in caves (increased for larger map)
        this.spawnFoodInCaves(20);

        // Spawn enemy nests in caves
        this.spawnEnemiesInCaves(4);
    }

    generateCaveSystems() {
        // Generate random cave systems at different depths
        const caves = [];

        // Generate 8-12 random caves
        const caveCount = 8 + Math.floor(Math.random() * 5);

        for (let i = 0; i < caveCount; i++) {
            const depth = 15 + i * 5 + Math.floor(Math.random() * 8);
            const x = 10 + Math.floor(Math.random() * (this.worldWidth - 20));
            const y = Math.min(depth, this.worldHeight - 10);

            // Vary cave sizes based on depth
            const baseSize = 6 + Math.floor(Math.random() * 8);
            const depthBonus = Math.floor(y / 15);
            const size = baseSize + depthBonus;

            // Different cave types
            const type = Math.random();
            let caveType = 'chamber';
            if (type < 0.3) caveType = 'tunnel';
            else if (type < 0.5) caveType = 'vertical';
            else if (type < 0.7) caveType = 'chamber';
            else caveType = 'complex';

            caves.push({ x, y, size, type: caveType });
        }

        // Generate caves
        for (let cave of caves) {
            if (cave.type === 'chamber') {
                this.generateCave(cave.x, cave.y, cave.size);
            } else if (cave.type === 'tunnel') {
                this.generateTunnelCave(cave.x, cave.y, cave.size);
            } else if (cave.type === 'vertical') {
                this.generateVerticalCave(cave.x, cave.y, cave.size);
            } else if (cave.type === 'complex') {
                this.generateComplexCave(cave.x, cave.y, cave.size);
            }
        }

        // Connect some caves with tunnels
        for (let i = 0; i < caves.length - 1; i++) {
            if (Math.random() < 0.4) {
                const cave1 = caves[i];
                const cave2 = caves[i + 1];
                this.generateConnectingTunnel(cave1.x, cave1.y, cave2.x, cave2.y);
            }
        }

        // Add some random vertical shafts
        for (let i = 0; i < 3; i++) {
            const x = 15 + Math.floor(Math.random() * (this.worldWidth - 30));
            const startY = 15 + Math.floor(Math.random() * 10);
            const length = 10 + Math.floor(Math.random() * 20);
            this.generateShaft(x, startY, length);
        }
    }

    generateCave(centerX, centerY, radius) {
        // Cellular automata cave generation
        // Create a temporary grid
        const size = radius * 2 + 4;
        const grid = [];

        // Initialize with random noise
        for (let y = 0; y < size; y++) {
            grid[y] = [];
            for (let x = 0; x < size; x++) {
                grid[y][x] = Math.random() < 0.45 ? 1 : 0; // 1 = cave, 0 = wall
            }
        }

        // Apply cellular automata rules
        for (let iteration = 0; iteration < 4; iteration++) {
            const newGrid = [];
            for (let y = 0; y < size; y++) {
                newGrid[y] = [];
                for (let x = 0; x < size; x++) {
                    const neighbors = this.countNeighbors(grid, x, y);

                    if (grid[y][x] === 1) {
                        // Cave cell
                        newGrid[y][x] = neighbors >= 4 ? 1 : 0;
                    } else {
                        // Wall cell
                        newGrid[y][x] = neighbors >= 5 ? 1 : 0;
                    }
                }
            }

            // Copy newGrid to grid
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    grid[y][x] = newGrid[y][x];
                }
            }
        }

        // Apply cave to world, with circular fade
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (grid[y][x] === 1) {
                    const worldX = Math.floor(centerX - radius - 2 + x);
                    const worldY = Math.floor(centerY - radius - 2 + y);

                    // Calculate distance from center for circular fade
                    const dx = x - size / 2;
                    const dy = y - size / 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const maxDist = radius;

                    // Only apply if within radius and random chance based on distance
                    if (dist < maxDist && this.isValidTile(worldX, worldY) && worldY >= 10) {
                        const fadeChance = 1 - (dist / maxDist) * 0.5;
                        if (Math.random() < fadeChance) {
                            this.tiles[worldY][worldX].dug = true;
                            this.tiles[worldY][worldX].type = 'air';
                        }
                    }
                }
            }
        }
    }

    countNeighbors(grid, x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;

                const nx = x + dx;
                const ny = y + dy;

                // Treat out of bounds as walls
                if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) {
                    count++;
                } else {
                    count += grid[ny][nx];
                }
            }
        }
        return count;
    }

    generateTunnelCave(startX, startY, length) {
        // Generate a winding horizontal tunnel
        let x = startX;
        let y = startY;
        const segments = 3 + Math.floor(Math.random() * 4);

        for (let seg = 0; seg < segments; seg++) {
            const segLength = length + Math.floor(Math.random() * length);
            const endX = x + (Math.random() - 0.5) * segLength;
            const endY = y + (Math.random() - 0.5) * (length / 2);

            this.carveTunnel(x, y, endX, endY, 2 + Math.floor(Math.random() * 2));
            x = endX;
            y = endY;
        }
    }

    generateVerticalCave(centerX, startY, height) {
        // Generate a vertical shaft with some variation
        let x = centerX;
        const segments = 2 + Math.floor(Math.random() * 3);
        const segHeight = height / segments;

        for (let seg = 0; seg < segments; seg++) {
            const y1 = startY + seg * segHeight;
            const y2 = startY + (seg + 1) * segHeight;
            const endX = x + (Math.random() - 0.5) * 6;

            this.carveTunnel(x, y1, endX, y2, 2 + Math.floor(Math.random() * 2));
            x = endX;

            // Add small chambers occasionally
            if (Math.random() < 0.5) {
                this.generateCave(x, y2, 3 + Math.floor(Math.random() * 3));
            }
        }
    }

    generateComplexCave(centerX, centerY, size) {
        // Generate a complex cave with multiple chambers connected by tunnels
        const chambers = 3 + Math.floor(Math.random() * 3);
        const chamberPositions = [];

        // Generate main chamber
        this.generateCave(centerX, centerY, size);
        chamberPositions.push({ x: centerX, y: centerY });

        // Generate satellite chambers
        for (let i = 0; i < chambers; i++) {
            const angle = (i / chambers) * Math.PI * 2 + Math.random() * 0.5;
            const dist = size + Math.random() * size * 2;
            const x = centerX + Math.cos(angle) * dist;
            const y = centerY + Math.sin(angle) * dist;
            const chamberSize = Math.floor(size * 0.5) + Math.floor(Math.random() * size * 0.5);

            this.generateCave(x, y, chamberSize);
            chamberPositions.push({ x, y });

            // Connect to previous chamber
            if (i > 0) {
                const prev = chamberPositions[i];
                this.carveTunnel(prev.x, prev.y, x, y, 1 + Math.floor(Math.random() * 2));
            }
        }

        // Connect some random chambers
        for (let i = 0; i < Math.floor(chambers / 2); i++) {
            const c1 = chamberPositions[Math.floor(Math.random() * chamberPositions.length)];
            const c2 = chamberPositions[Math.floor(Math.random() * chamberPositions.length)];
            if (c1 !== c2) {
                this.carveTunnel(c1.x, c1.y, c2.x, c2.y, 1);
            }
        }
    }

    generateConnectingTunnel(x1, y1, x2, y2) {
        // Generate a tunnel connecting two points with some variation
        const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * 10;
        const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * 10;

        this.carveTunnel(x1, y1, midX, midY, 1 + Math.floor(Math.random() * 2));
        this.carveTunnel(midX, midY, x2, y2, 1 + Math.floor(Math.random() * 2));
    }

    generateShaft(x, startY, length) {
        // Generate a mostly vertical shaft
        let currentY = startY;
        const endY = Math.min(startY + length, this.worldHeight - 5);

        while (currentY < endY) {
            const segLength = 3 + Math.floor(Math.random() * 5);
            const nextY = Math.min(currentY + segLength, endY);
            const nextX = x + (Math.random() - 0.5) * 2;

            this.carveTunnel(x, currentY, nextX, nextY, 1 + Math.floor(Math.random() * 1));

            // Small platform occasionally
            if (Math.random() < 0.3) {
                this.carveTunnel(nextX - 2, nextY, nextX + 2, nextY, 1);
            }

            x = nextX;
            currentY = nextY;
        }
    }

    carveTunnel(x1, y1, x2, y2, width) {
        // Carve a tunnel from (x1, y1) to (x2, y2) with given width
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.floor(x1 + dx * t);
            const y = Math.floor(y1 + dy * t);

            // Carve circle at this point
            for (let oy = -width; oy <= width; oy++) {
                for (let ox = -width; ox <= width; ox++) {
                    const distFromCenter = Math.sqrt(ox * ox + oy * oy);
                    if (distFromCenter <= width) {
                        const tx = x + ox;
                        const ty = y + oy;
                        if (this.isValidTile(tx, ty) && ty >= 10) {
                            this.tiles[ty][tx].dug = true;
                            this.tiles[ty][tx].type = 'air';
                        }
                    }
                }
            }
        }
    }

    spawnFoodInCaves(count) {
        // Find cave locations (open spaces underground)
        const caveSpots = [];

        // Look for cave spots with more lenient criteria
        for (let y = 12; y < this.worldHeight - 5; y++) {
            for (let x = 5; x < this.worldWidth - 5; x++) {
                const tile = this.tiles[y][x];
                // Look for open areas (caves)
                if (tile.dug && tile.type === 'air') {
                    // Check if it has some nearby open space (is in a cave)
                    let openCount = 0;
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const checkTile = this.getTile(x + dx, y + dy);
                            if (checkTile && checkTile.dug) {
                                openCount++;
                            }
                        }
                    }
                    // Good cave spot: has enough open space around it
                    // Allow food to spawn closer to start (reduced from 10 to 5)
                    const distFromStart = Math.abs(x - this.worldWidth / 2);
                    if (openCount > 8 && distFromStart > 5) {
                        caveSpots.push({ x: x + 0.5, y: y + 0.5 });
                    }
                }
            }
        }

        // Spawn food in random cave spots
        const spawned = Math.min(count, caveSpots.length);
        for (let i = 0; i < spawned; i++) {
            const randomIndex = Math.floor(Math.random() * caveSpots.length);
            const spot = caveSpots[randomIndex];
            const amount = 50 + Math.floor(Math.random() * 100);
            this.foodSources.push(new FoodSource(spot.x, spot.y, amount));

            // Remove used spot to avoid duplicates
            caveSpots.splice(randomIndex, 1);
        }

        // Debug: log how many food sources we spawned
        console.log(`Spawned ${this.foodSources.length} food sources`);
    }

    spawnEnemiesInCaves(count) {
        // Find good cave chambers for enemy nests
        const nestSpots = [];

        for (let y = 20; y < this.worldHeight - 10; y++) {
            for (let x = 10; x < this.worldWidth - 10; x++) {
                const tile = this.tiles[y][x];
                if (tile.dug && tile.type === 'air') {
                    // Check for a decent-sized cave chamber
                    let openCount = 0;
                    for (let dy = -4; dy <= 4; dy++) {
                        for (let dx = -4; dx <= 4; dx++) {
                            const checkTile = this.getTile(x + dx, y + dy);
                            if (checkTile && checkTile.dug) {
                                openCount++;
                            }
                        }
                    }
                    // Good nest spot: large enough open area
                    if (openCount > 20 && openCount < 50) {
                        // Make sure not too close to starting area
                        const startX = this.worldWidth / 2;
                        const dist = Math.abs(x - startX);

                        // Make sure not too close to any food sources
                        let tooCloseToFood = false;
                        for (const food of this.foodSources) {
                            const dx = food.x - (x + 0.5);
                            const dy = food.y - (y + 0.5);
                            const distToFood = Math.sqrt(dx * dx + dy * dy);
                            if (distToFood < 15) { // Minimum 15 units from food
                                tooCloseToFood = true;
                                break;
                            }
                        }

                        if (dist > 30 && !tooCloseToFood) {
                            nestSpots.push({ x: x + 0.5, y: y + 0.5 });
                        }
                    }
                }
            }
        }

        // Spawn enemy colonies with different factions
        for (let i = 0; i < Math.min(count, nestSpots.length); i++) {
            const spot = nestSpots[Math.floor(Math.random() * nestSpots.length)];

            // Create enemy colony (faction 1, 2, 3, etc.)
            const factionId = i + 1; // Player is faction 0, enemies are 1+
            const enemyColony = new Colony(factionId, spot.x, spot.y, false);
            enemyColony.createQueen(spot.x, spot.y);
            this.colonies.push(enemyColony);

            // Spawn 1 worker for this colony (same as player)
            const worker = new WorkerAnt(
                spot.x + (Math.random() - 0.5) * 4,
                spot.y + (Math.random() - 0.5) * 4,
                false
            );
            enemyColony.addWorker(worker);

            // Remove used spot to avoid overlap
            nestSpots.splice(nestSpots.indexOf(spot), 1);
        }

        // Debug: log how many colonies we spawned
        console.log(`Spawned ${this.colonies.length} total colonies (${count} enemy factions)`);
    }

    createColony() {
        const startX = this.worldWidth / 2;
        const startY = 12;

        // Create player colony (faction 0)
        const playerColony = new Colony(0, startX, startY, true);
        playerColony.createQueen(startX, startY);
        this.colonies.push(playerColony);

        // Create player-controlled worker
        this.player = new WorkerAnt(startX + 1, startY, true);
        playerColony.addWorker(this.player);

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
        } else if (this.player && !this.player.alive) {
            // Game over
            this.running = false;
            alert('Your ant died! Game Over. Refresh to play again.');
        }

        // Update all colonies
        for (const colony of this.colonies) {
            colony.update(dt, this);

            // Check if player's queen died
            if (colony.isPlayer && colony.queen && (!colony.queen.alive || colony.queen.health <= 0)) {
                this.running = false;
                alert('Your Queen died! Game Over. Refresh to play again.');
            }
        }

        // Update enemy ants
        if (this.enemies) {
            this.enemies.forEach(enemy => enemy.update(dt, {}, this));
            this.enemies = this.enemies.filter(e => e.alive);
        }

        // Remove dead colonies (no queen)
        this.colonies = this.colonies.filter(c => c.queen && c.queen.alive);

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
        // Get player's colony
        const playerColony = this.colonies.find(c => c.isPlayer);

        // Update food count (player's colony food)
        document.getElementById('food-count').textContent = playerColony ? playerColony.food : 0;

        // Update worker count (player's colony workers)
        document.getElementById('worker-count').textContent = playerColony ? playerColony.workers.length : 0;

        // Update player health
        document.getElementById('health').textContent =
            this.player ? Math.ceil(this.player.health) : 0;

        // Update factions menu
        this.updateFactionsUI();
    }

    updateFactionsUI() {
        const content = document.getElementById('factions-content');
        if (!content) return;

        // Sort colonies: player first, then by worker count descending
        const sortedColonies = [...this.colonies].sort((a, b) => {
            // Player colony always comes first
            if (a.isPlayer) return -1;
            if (b.isPlayer) return 1;

            // Sort other colonies by worker count (descending)
            return b.workers.length - a.workers.length;
        });

        // Build faction stats HTML
        let html = '';
        for (const colony of sortedColonies) {
            // Calculate average worker health
            let avgHealth = 0;
            if (colony.workers.length > 0) {
                const totalHealth = colony.workers.reduce((sum, w) => sum + w.health, 0);
                avgHealth = Math.ceil(totalHealth / colony.workers.length);
            }

            // Determine if this is the player's faction
            const isPlayer = colony.isPlayer ? ' (You)' : '';

            html += `
                <div class="faction-item">
                    <div class="faction-name">
                        <span class="faction-color-dot" style="background-color: ${colony.colors.worker}"></span>
                        ${colony.colors.name}${isPlayer}
                    </div>
                    <div class="faction-stats">
                        <div class="faction-stat">
                            <span class="faction-stat-label">Workers:</span>
                            <span>${colony.workers.length}</span>
                        </div>
                        <div class="faction-stat">
                            <span class="faction-stat-label">Avg HP:</span>
                            <span>${avgHealth}</span>
                        </div>
                        <div class="faction-stat">
                            <span class="faction-stat-label">Food:</span>
                            <span>${Math.floor(colony.food)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        content.innerHTML = html;
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

        // Render all colonies
        this.colonies.forEach(colony => colony.render(ctx, this.camera, this.tileSize, this));

        // Render enemy ants
        if (this.enemies) {
            this.enemies.forEach(enemy => enemy.render(ctx, this.camera, this.tileSize, this));
        }

        // Render player on top
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
            // Air/dug tunnel - light gray background for visibility
            const variation = (x * 13 + y * 17) % 15;
            const lightness = 180 + variation;
            this.ctx.fillStyle = `rgb(${lightness}, ${lightness}, ${lightness})`;
            this.ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);

            // Add subtle tunnel edges shadow
            if (!this.getTile(x-1, y)?.dug || !this.getTile(x+1, y)?.dug ||
                !this.getTile(x, y-1)?.dug || !this.getTile(x, y+1)?.dug) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
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
        // Almost never spawn particles - minimal spam!
        if (Math.random() < 0.05) {
            this.particles.push(new Particle(
                x, y,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4 - 1,
                Math.random() < 0.5 ? '#D2691E' : '#8B4513',
                0.8 + Math.random() * 0.5,
                6 + Math.random() * 4
            ));
        }
    }

    spawnDigBurst(x, y) {
        // Just 2 particles when breaking through
        for (let i = 0; i < 2; i++) {
            const angle = (i / 2) * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                Math.random() < 0.3 ? '#CD853F' : (Math.random() < 0.5 ? '#D2691E' : '#8B4513'),
                1.2 + Math.random() * 0.8,
                8 + Math.random() * 6
            ));
        }
    }

    spawnFoodParticles(x, y) {
        // Just 4 sparkles
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const colors = ['#FFD700', '#FFA500', '#FFFF00', '#FFE135'];
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 2,
                colors[Math.floor(Math.random() * colors.length)],
                1.0 + Math.random() * 0.5,
                8 + Math.random() * 6,
                'sparkle'
            ));
        }
        // Just 1 small glow ring
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const speed = 3;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                'rgba(255, 215, 0, 0.8)',
                0.6 + Math.random() * 0.3,
                5 + Math.random() * 3,
                'glow'
            ));
        }
    }

    spawnHitParticles(x, y) {
        // Just 3 blood particles
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 4;
            const colors = ['#FF0000', '#FF4444', '#CC0000', '#FF6666'];
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                colors[Math.floor(Math.random() * colors.length)],
                0.8 + Math.random() * 0.4,
                8 + Math.random() * 6
            ));
        }
        // Just 2 flash particles
        for (let i = 0; i < 2; i++) {
            const angle = (i / 2) * Math.PI * 2;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * 5,
                Math.sin(angle) * 5,
                'rgba(255, 255, 100, 0.9)',
                0.3,
                12 + Math.random() * 8,
                'flash'
            ));
        }
        this.screenShake.intensity = 15;
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
            // Try to spawn in a valid location near queen
            let spawnX = this.queen.x;
            let spawnY = this.queen.y;

            // Try a few random positions around the queen
            for (let attempt = 0; attempt < 10; attempt++) {
                const testX = this.queen.x + (Math.random() - 0.5) * 2;
                const testY = this.queen.y + (Math.random() - 0.5) * 2;

                if (this.canMove(testX, testY)) {
                    spawnX = testX;
                    spawnY = testY;
                    break;
                }
            }

            const newWorker = new WorkerAnt(spawnX, spawnY, false);
            this.workers.push(newWorker);
            console.log(`Worker spawned at (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})! Total workers: ${this.workers.length}`);
        }
    }

    findPath(startX, startY, endX, endY) {
        // Simple A* pathfinding through dug tunnels
        const start = { x: Math.floor(startX), y: Math.floor(startY) };
        const end = { x: Math.floor(endX), y: Math.floor(endY) };

        // Quick check if start or end is invalid
        if (!this.canMove(start.x, start.y) || !this.canMove(end.x, end.y)) {
            return null;
        }

        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const key = (x, y) => `${x},${y}`;
        gScore.set(key(start.x, start.y), 0);
        fScore.set(key(start.x, start.y), this.heuristic(start.x, start.y, end.x, end.y));

        let iterations = 0;
        const maxIterations = 500; // Prevent infinite loops

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Find node with lowest fScore
            let current = openSet[0];
            let currentIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                const currentF = fScore.get(key(openSet[i].x, openSet[i].y)) || Infinity;
                const lowestF = fScore.get(key(current.x, current.y)) || Infinity;
                if (currentF < lowestF) {
                    current = openSet[i];
                    currentIdx = i;
                }
            }

            // Reached goal
            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.splice(currentIdx, 1);

            // Check neighbors
            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 },
                // Diagonals
                { x: current.x + 1, y: current.y + 1 },
                { x: current.x + 1, y: current.y - 1 },
                { x: current.x - 1, y: current.y + 1 },
                { x: current.x - 1, y: current.y - 1 }
            ];

            for (let neighbor of neighbors) {
                if (!this.canMove(neighbor.x, neighbor.y)) continue;

                const isDiagonal = neighbor.x !== current.x && neighbor.y !== current.y;
                const tentativeG = (gScore.get(key(current.x, current.y)) || Infinity) + (isDiagonal ? 1.4 : 1);

                const neighborKey = key(neighbor.x, neighbor.y);
                if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + this.heuristic(neighbor.x, neighbor.y, end.x, end.y));

                    if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return null; // No path found
    }

    heuristic(x1, y1, x2, y2) {
        // Manhattan distance
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    reconstructPath(cameFrom, current) {
        const path = [{ x: current.x + 0.5, y: current.y + 0.5 }];
        const key = (x, y) => `${x},${y}`;

        while (cameFrom.has(key(current.x, current.y))) {
            current = cameFrom.get(key(current.x, current.y));
            path.unshift({ x: current.x + 0.5, y: current.y + 0.5 });
        }

        return path;
    }
}

class Joystick {
    constructor() {
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.startX = 0; // Initial touch position (joystick center)
        this.startY = 0;
        this.currentX = 0; // Current touch position
        this.currentY = 0;
        this.canvas = document.getElementById('gameCanvas');
        this.maxRadius = 60; // Maximum distance stick can move from center

        this.setupEvents();
    }

    setupEvents() {
        const startTouch = (e) => {
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;

            // Set joystick center to touch position
            this.startX = touch.clientX;
            this.startY = touch.clientY;
            this.currentX = touch.clientX;
            this.currentY = touch.clientY;
            this.active = true;

            // Position joystick base at touch point
            this.base.style.left = `${this.startX - 60}px`;
            this.base.style.top = `${this.startY - 60}px`;
            this.base.style.opacity = '0.7';

            this.updateJoystick();
        };

        const moveTouch = (e) => {
            if (!this.active) return;
            e.preventDefault();

            const touch = e.touches ? e.touches[0] : e;
            this.currentX = touch.clientX;
            this.currentY = touch.clientY;

            this.updateJoystick();
        };

        const endTouch = (e) => {
            e.preventDefault();
            this.active = false;
            this.x = 0;
            this.y = 0;

            // Reset joystick visual
            this.stick.style.transform = 'translate(-50%, -50%)';
            this.base.style.opacity = '0';
        };

        // Touch events
        this.canvas.addEventListener('touchstart', startTouch);
        this.canvas.addEventListener('touchmove', moveTouch);
        this.canvas.addEventListener('touchend', endTouch);
        this.canvas.addEventListener('touchcancel', endTouch);

        // Mouse events for desktop testing
        this.canvas.addEventListener('mousedown', startTouch);
        window.addEventListener('mousemove', moveTouch);
        window.addEventListener('mouseup', endTouch);
    }

    updateJoystick() {
        // Calculate offset from joystick center
        const dx = this.currentX - this.startX;
        const dy = this.currentY - this.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) { // Minimum threshold to register input
            // Normalize direction
            this.x = dx / distance;
            this.y = dy / distance;

            // Clamp stick position to maxRadius
            const stickDistance = Math.min(distance, this.maxRadius);
            const stickDx = (dx / distance) * stickDistance;
            const stickDy = (dy / distance) * stickDistance;

            // Move stick visual
            this.stick.style.transform = `translate(calc(-50% + ${stickDx}px), calc(-50% + ${stickDy}px))`;
        } else {
            // Too close to center, no input
            this.x = 0;
            this.y = 0;
            this.stick.style.transform = 'translate(-50%, -50%)';
        }
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

    takeDamage(amount, game = null) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;

            // Drop carried food when dying
            if (this.carryingFood && this.foodAmount > 0 && game) {
                game.foodSources.push(new FoodSource(this.x, this.y, this.foodAmount));
            }
        }
    }

    render(ctx, camera, tileSize, game = null) {
        if (!this.alive) return;

        const shakeX = game ? game.screenShake.x : 0;
        const shakeY = game ? game.screenShake.y : 0;
        const screenX = this.x * tileSize - camera.x + shakeX;
        const screenY = this.y * tileSize - camera.y + shakeY;
        const size = this.size * tileSize;

        ctx.save();

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(screenX + 2, screenY + size * 0.5, size * 0.7, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const legOffset = (i - 1) * size * 0.3;
            // Left legs
            ctx.beginPath();
            ctx.moveTo(screenX - size * 0.4, screenY + legOffset);
            ctx.lineTo(screenX - size * 0.8, screenY + legOffset + size * 0.4);
            ctx.stroke();
            // Right legs
            ctx.beginPath();
            ctx.moveTo(screenX + size * 0.4, screenY + legOffset);
            ctx.lineTo(screenX + size * 0.8, screenY + legOffset + size * 0.4);
            ctx.stroke();
        }

        // Abdomen (back segment)
        const abdomenGradient = ctx.createRadialGradient(screenX, screenY + size * 0.2, 0, screenX, screenY + size * 0.2, size * 0.6);
        abdomenGradient.addColorStop(0, this.color);
        abdomenGradient.addColorStop(0.7, this.color);
        abdomenGradient.addColorStop(1, '#000000');
        ctx.fillStyle = abdomenGradient;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + size * 0.2, size * 0.6, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Thorax (middle segment)
        const thoraxGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 0.45);
        thoraxGradient.addColorStop(0, this.color);
        thoraxGradient.addColorStop(0.5, this.color);
        thoraxGradient.addColorStop(1, '#000000');
        ctx.fillStyle = thoraxGradient;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.5, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head with gradient
        const headGradient = ctx.createRadialGradient(screenX, screenY - size * 0.35, size * 0.1, screenX, screenY - size * 0.35, size * 0.4);
        headGradient.addColorStop(0, this.color);
        headGradient.addColorStop(0.7, this.color);
        headGradient.addColorStop(1, '#000000');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.35, size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.2, screenY - size * 0.4, size * 0.08, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.2, screenY - size * 0.4, size * 0.08, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.18, screenY - size * 0.42, size * 0.04, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.22, screenY - size * 0.42, size * 0.04, 0, Math.PI * 2);
        ctx.fill();

        // Antennae with curve
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX - size * 0.15, screenY - size * 0.65);
        ctx.quadraticCurveTo(screenX - size * 0.3, screenY - size * 0.9, screenX - size * 0.5, screenY - size * 0.95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenX + size * 0.15, screenY - size * 0.65);
        ctx.quadraticCurveTo(screenX + size * 0.3, screenY - size * 0.9, screenX + size * 0.5, screenY - size * 0.95);
        ctx.stroke();

        // Antennae tips
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX - size * 0.5, screenY - size * 0.95, size * 0.1, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.5, screenY - size * 0.95, size * 0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Health bar - always show for enemies, show for player/workers when damaged
        const isEnemy = this.color === '#FF0000';
        if (this.health < this.maxHealth || this.isPlayer || isEnemy) {
            const barWidth = size * 2.5;
            const barHeight = 4;
            const barX = screenX - barWidth / 2;
            const barY = screenY - size * 1.2;

            // Bar background
            ctx.fillStyle = '#222';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

            // Bar fill
            ctx.fillStyle = '#f00';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }

        // Removed player indicator - only show when carrying food
    }
}

class WorkerAnt extends Ant {
    constructor(x, y, isPlayer = false) {
        super(x, y, isPlayer);
        this.color = '#8B4513'; // Saddle brown - much more visible
        this.size = 0.9; // 50% bigger than original (0.6) for better visibility
        this.carryingFood = false;
        this.foodAmount = 0;
        this.targetFood = null;
        this.state = 'idle'; // idle, seeking, carrying, fighting
        this.digCooldown = 0;
        this.attackCooldown = 0;
        this.stateTimer = 0;
        this.path = null; // Pathfinding
        this.pathIndex = 0;
        this.pathRecalcTimer = 0;
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
                // Blocked - try digging
                // For diagonal movement, dig both X and Y blocking tiles
                if (Math.abs(input.x) > 0.1 && Math.abs(input.y) > 0.1) {
                    // Diagonal - dig both directions to prevent getting stuck
                    game.digTile(this.x + input.x * 0.6, this.y, dt * 8);
                    game.digTile(this.x, this.y + input.y * 0.6, dt * 8);
                }
                // Always dig in the movement direction
                const digX = this.x + input.x * 0.6;
                const digY = this.y + input.y * 0.6;
                game.digTile(digX, digY, dt * 10);
            }
        }

        // Pick up food - increased range to 1.5 tiles
        if (!this.carryingFood) {
            for (let food of game.foodSources) {
                const dx = food.x - this.x;
                const dy = food.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 1.5 && food.amount > 0) {
                    const taken = Math.min(15, food.amount); // Player can carry 15 food
                    food.amount -= taken;
                    this.foodAmount = taken;
                    this.carryingFood = true;
                    game.spawnFoodParticles(this.x, this.y);
                    break;
                }
            }
        }

        // Deliver food to queen
        if (this.carryingFood && this.colony && this.colony.queen) {
            const dx = this.colony.queen.x - this.x;
            const dy = this.colony.queen.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 2.5) {
                this.colony.food += this.foodAmount;
                this.foodAmount = 0;
                this.carryingFood = false;
                // Show delivery feedback particles
                game.spawnFoodParticles(this.colony.queen.x, this.colony.queen.y);
            }
        }
    }

    updateAI(dt, game) {
        // Simple AI behavior with pathfinding
        if (this.carryingFood) {
            // Return to queen using pathfinding
            this.pathRecalcTimer -= dt;

            // Calculate or recalculate path to queen
            if (this.colony && this.colony.queen) {
                if (!this.path || this.pathRecalcTimer <= 0) {
                    this.path = game.findPath(this.x, this.y, this.colony.queen.x, this.colony.queen.y);
                    this.pathIndex = 0;
                    this.pathRecalcTimer = 2; // Recalc every 2 seconds
                }

                // Follow path if we have one
                if (this.path && this.pathIndex < this.path.length) {
                    const target = this.path[this.pathIndex];
                    this.moveTowards(target.x, target.y, dt, game);

                    // Move to next waypoint if close enough
                    const dx = target.x - this.x;
                    const dy = target.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 0.5) {
                        this.pathIndex++;
                    }
                } else {
                    // No path found, try direct movement (will dig if needed)
                    this.moveTowards(this.colony.queen.x, this.colony.queen.y, dt, game);
                }
            }

            if (this.colony && this.colony.queen) {
                const dx = this.colony.queen.x - this.x;
                const dy = this.colony.queen.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 2.5) {
                    this.colony.food += this.foodAmount;
                    this.foodAmount = 0;
                    this.carryingFood = false;
                    this.targetFood = null;
                    this.state = 'idle';
                    this.path = null; // Clear path
                    // Show delivery feedback particles
                    game.spawnFoodParticles(this.colony.queen.x, this.colony.queen.y);
                }
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
                    const taken = Math.min(5, this.targetFood.amount); // AI workers carry only 5 food
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
                // Blocked - dig to clear path
                // For diagonal movement, dig both X and Y directions
                if (Math.abs(dirX) > 0.1 && Math.abs(dirY) > 0.1) {
                    // Diagonal - dig both directions to prevent getting stuck
                    game.digTile(this.x + dirX * 0.6, this.y, dt * 8);
                    game.digTile(this.x, this.y + dirY * 0.6, dt * 8);
                }
                // Always dig in the movement direction
                game.digTile(this.x + dirX * 0.6, this.y + dirY * 0.6, dt * 10);
            }
        }
    }

    checkCombat(dt, game) {
        // Attack workers and queens from other factions
        // Player deals 2x damage
        const workerDamage = this.isPlayer ? 30 : 15;
        const queenDamage = this.isPlayer ? 20 : 10;

        if (this.isPlayer && Math.random() < 0.01) {
            console.log('[PLAYER COMBAT] attackCooldown:', this.attackCooldown);
            console.log('[PLAYER COMBAT] game.enemies:', game.enemies ? game.enemies.length : 'undefined');
            console.log('[PLAYER COMBAT] game.colonies:', game.colonies.length);
        }

        // Check enemy ants (EnemyAnt instances stored in game.enemies)
        if (game.enemies) {
            for (const enemy of game.enemies) {
                if (!enemy.alive || enemy === this) continue;

                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (this.isPlayer && dist < 3) {
                    console.log('[PLAYER] EnemyAnt nearby! dist:', dist.toFixed(2), 'cooldown:', this.attackCooldown.toFixed(2));
                }

                if (dist < 1.5 && this.attackCooldown <= 0) {
                    console.log('[PLAYER] ATTACKING ENEMY ANT!!!');
                    enemy.takeDamage(workerDamage, game);
                    this.attackCooldown = 0.5;
                    game.spawnHitParticles(enemy.x, enemy.y);
                    game.screenShake.intensity = 8;
                    return; // Attack one enemy per frame
                }
            }
        }

        for (const colony of game.colonies) {
            // Skip our own colony
            if (this.colony && colony.factionId === this.colony.factionId) continue;

            // Check enemy workers (WorkerAnt instances in colony.workers)
            for (const enemy of colony.workers) {
                if (!enemy.alive || enemy === this) continue;

                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (this.isPlayer && dist < 3) {
                    console.log('[PLAYER] WorkerAnt nearby! dist:', dist.toFixed(2), 'cooldown:', this.attackCooldown.toFixed(2));
                }

                if (dist < 1.5 && this.attackCooldown <= 0) {
                    console.log('[PLAYER] ATTACKING WORKER ANT!!!');
                    enemy.takeDamage(workerDamage, game);
                    this.attackCooldown = 0.5;
                    game.spawnHitParticles(enemy.x, enemy.y);
                    game.screenShake.intensity = 8;
                    return; // Attack one enemy per frame
                }
            }

            // Check enemy queen
            if (colony.queen && colony.queen.alive) {
                const dx = colony.queen.x - this.x;
                const dy = colony.queen.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (this.isPlayer && dist < 3) {
                    console.log('[PLAYER] Queen nearby! dist:', dist.toFixed(2), 'cooldown:', this.attackCooldown.toFixed(2));
                }

                if (dist < 1.5 && this.attackCooldown <= 0) {
                    console.log('[PLAYER] ATTACKING QUEEN!!!');
                    colony.queen.takeDamage(queenDamage, game);
                    this.attackCooldown = 0.5;
                    game.spawnHitParticles(colony.queen.x, colony.queen.y);
                    game.screenShake.intensity = 8;
                    return;
                }
            }
        }
    }

    render(ctx, camera, tileSize, game = null) {
        super.render(ctx, camera, tileSize, game);

        // Green carrying indicator when holding food
        if (this.carryingFood) {
            const shakeX = game ? game.screenShake.x : 0;
            const shakeY = game ? game.screenShake.y : 0;
            const screenX = this.x * tileSize - camera.x + shakeX;
            const screenY = this.y * tileSize - camera.y + shakeY;
            const size = this.size * tileSize;

            // Draw food dot indicator (small gold circle)
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(screenX, screenY - tileSize * 0.3, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Queen extends Ant {
    constructor(x, y, colony) {
        super(x, y, false);
        this.colony = colony;
        this.color = '#4a2a0a';
        this.size = 0.8;
        this.maxHealth = 200;
        this.health = 200;
        this.spawnTimer = 0;
        this.spawnCooldown = 10; // seconds per worker
        this.foodPerWorker = 20;
    }

    update(dt, game) {
        // Initialize spawnTimer if it's NaN or undefined (for old saves)
        if (isNaN(this.spawnTimer) || this.spawnTimer === undefined) {
            this.spawnTimer = 0;
            console.log('Initialized spawn timer');
        }

        this.spawnTimer += dt;

        // Spawn new workers if we have food
        if (this.spawnTimer >= this.spawnCooldown && this.colony && this.colony.food >= this.foodPerWorker) {
            console.log(`${this.colony.colors.name} Queen spawning worker! Food: ${this.colony.food}, Timer: ${this.spawnTimer.toFixed(2)}s`);
            this.colony.food -= this.foodPerWorker;
            this.colony.spawnWorker(game);
            this.spawnTimer = 0;
        }
    }

    render(ctx, camera, tileSize, game = null) {
        const shakeX = game ? game.screenShake.x : 0;
        const shakeY = game ? game.screenShake.y : 0;
        const screenX = this.x * tileSize - camera.x + shakeX;
        const screenY = this.y * tileSize - camera.y + shakeY;
        const size = this.size * tileSize;

        ctx.save();

        // Royal glow aura
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8;
        const auraGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 1.5 * pulse);
        auraGradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
        auraGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.1)');
        auraGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = auraGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(screenX + 3, screenY + size * 0.6, size * 1.0, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (more legs for queen)
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const legOffset = (i - 1.5) * size * 0.25;
            // Left legs
            ctx.beginPath();
            ctx.moveTo(screenX - size * 0.6, screenY + legOffset);
            ctx.lineTo(screenX - size * 1.0, screenY + legOffset + size * 0.5);
            ctx.stroke();
            // Right legs
            ctx.beginPath();
            ctx.moveTo(screenX + size * 0.6, screenY + legOffset);
            ctx.lineTo(screenX + size * 1.0, screenY + legOffset + size * 0.5);
            ctx.stroke();
        }

        // Large segmented abdomen
        for (let i = 0; i < 3; i++) {
            const segmentY = screenY + size * 0.3 + i * size * 0.25;
            const segmentSize = (0.9 - i * 0.1);
            const abdomenGradient = ctx.createRadialGradient(screenX, segmentY, 0, screenX, segmentY, size * 0.8 * segmentSize);
            abdomenGradient.addColorStop(0, '#6B4423');
            abdomenGradient.addColorStop(0.5, this.color);
            abdomenGradient.addColorStop(1, '#000000');
            ctx.fillStyle = abdomenGradient;
            ctx.beginPath();
            ctx.ellipse(screenX, segmentY, size * 0.8 * segmentSize, size * 0.5 * segmentSize, 0, 0, Math.PI * 2);
            ctx.fill();

            // Segment shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.ellipse(screenX - size * 0.3, segmentY - size * 0.1, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Thorax
        const thoraxGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 0.6);
        thoraxGradient.addColorStop(0, '#6B4423');
        thoraxGradient.addColorStop(0.5, this.color);
        thoraxGradient.addColorStop(1, '#000000');
        ctx.fillStyle = thoraxGradient;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.6, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head with gradient
        const headGradient = ctx.createRadialGradient(screenX, screenY - size * 0.45, size * 0.15, screenX, screenY - size * 0.45, size * 0.45);
        headGradient.addColorStop(0, '#6B4423');
        headGradient.addColorStop(0.5, this.color);
        headGradient.addColorStop(1, '#000000');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.45, size * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (compound eyes - larger)
        ctx.fillStyle = '#8B0000';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.25, screenY - size * 0.5, size * 0.12, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.25, screenY - size * 0.5, size * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = 'rgba(255, 100, 100, 0.6)';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.22, screenY - size * 0.53, size * 0.05, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.28, screenY - size * 0.53, size * 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - size * 0.2, screenY - size * 0.75);
        ctx.quadraticCurveTo(screenX - size * 0.4, screenY - size * 1.0, screenX - size * 0.6, screenY - size * 1.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenX + size * 0.2, screenY - size * 0.75);
        ctx.quadraticCurveTo(screenX + size * 0.4, screenY - size * 1.0, screenX + size * 0.6, screenY - size * 1.1);
        ctx.stroke();

        // Royal crown
        const crownY = screenY - size * 0.85;
        // Crown base
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(screenX, crownY - size * 0.25);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const x = screenX + Math.cos(angle) * size * 0.25;
            const y = crownY + Math.sin(angle) * size * 0.25;
            if (i % 2 === 0) {
                ctx.lineTo(x, y - size * 0.15);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();

        // Crown shine
        const crownGradient = ctx.createRadialGradient(screenX, crownY, 0, screenX, crownY, size * 0.25);
        crownGradient.addColorStop(0, 'rgba(255, 255, 200, 0.9)');
        crownGradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.6)');
        crownGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = crownGradient;
        ctx.beginPath();
        ctx.arc(screenX, crownY, size * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Crown jewel
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(screenX, crownY, size * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.03, crownY - size * 0.03, size * 0.03, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Health bar
        const barWidth = size * 2.5;
        const barHeight = 5;
        const barX = screenX - barWidth / 2;
        const barY = screenY - size * 1.3;

        // Bar background
        ctx.fillStyle = '#222';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

        // Bar fill
        ctx.fillStyle = '#f00';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        const healthGradient = ctx.createLinearGradient(barX, barY, barX + barWidth * (this.health / this.maxHealth), barY);
        healthGradient.addColorStop(0, '#0f0');
        healthGradient.addColorStop(1, '#0f0');
        ctx.fillStyle = healthGradient;
        ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
    }
}

class EnemyQueen extends Ant {
    constructor(x, y) {
        super(x, y, false);
        this.color = '#8B0000'; // Dark red for enemy queen
        this.size = 0.8;
        this.maxHealth = 200;
        this.health = 200;
        this.spawnTimer = 0;
        this.spawnCooldown = 15; // Slower spawning than friendly queen
        this.foodPerWorker = 25; // Requires more food
        this.food = 0; // Enemy queen's food storage
    }

    update(dt, game) {
        if (!this.alive) return;

        // Initialize spawnTimer if needed
        if (isNaN(this.spawnTimer) || this.spawnTimer === undefined) {
            this.spawnTimer = 0;
        }

        this.spawnTimer += dt;

        // Spawn new workers if we have food
        if (this.spawnTimer >= this.spawnCooldown && this.food >= this.foodPerWorker) {
            console.log(`Enemy queen spawning worker! Food: ${this.food}`);
            this.food -= this.foodPerWorker;
            this.spawnEnemyWorker(game);
            this.spawnTimer = 0;
        }
    }

    spawnEnemyWorker(game) {
        // Try to spawn in a valid location near queen
        let spawnX = this.x;
        let spawnY = this.y;

        // Try a few random positions around the queen
        for (let attempt = 0; attempt < 10; attempt++) {
            const testX = this.x + (Math.random() - 0.5) * 2;
            const testY = this.y + (Math.random() - 0.5) * 2;

            if (game.canMove(testX, testY)) {
                spawnX = testX;
                spawnY = testY;
                break;
            }
        }

        const newWorker = new EnemyAnt(spawnX, spawnY, this);
        game.enemies.push(newWorker);
        console.log(`Enemy worker spawned! Total enemy workers: ${game.enemies.length}`);
    }

    render(ctx, camera, tileSize, game = null) {
        const shakeX = game ? game.screenShake.x : 0;
        const shakeY = game ? game.screenShake.y : 0;
        const screenX = this.x * tileSize - camera.x + shakeX;
        const screenY = this.y * tileSize - camera.y + shakeY;
        const size = this.size * tileSize;

        ctx.save();

        // Dark red evil glow aura
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8;
        const auraGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 1.5 * pulse);
        auraGradient.addColorStop(0, 'rgba(139, 0, 0, 0.4)');
        auraGradient.addColorStop(0.5, 'rgba(139, 0, 0, 0.2)');
        auraGradient.addColorStop(1, 'rgba(139, 0, 0, 0)');
        ctx.fillStyle = auraGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(screenX + 3, screenY + size * 0.6, size * 1.0, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (more legs for queen)
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const legOffset = (i - 1.5) * size * 0.25;
            // Left legs
            ctx.beginPath();
            ctx.moveTo(screenX - size * 0.6, screenY + legOffset);
            ctx.lineTo(screenX - size * 1.0, screenY + legOffset + size * 0.5);
            ctx.stroke();
            // Right legs
            ctx.beginPath();
            ctx.moveTo(screenX + size * 0.6, screenY + legOffset);
            ctx.lineTo(screenX + size * 1.0, screenY + legOffset + size * 0.5);
            ctx.stroke();
        }

        // Large segmented abdomen
        for (let i = 0; i < 3; i++) {
            const segmentY = screenY + size * 0.3 + i * size * 0.25;
            const segmentSize = (0.9 - i * 0.1);
            const abdomenGradient = ctx.createRadialGradient(screenX, segmentY, 0, screenX, segmentY, size * 0.8 * segmentSize);
            abdomenGradient.addColorStop(0, '#A52A2A');
            abdomenGradient.addColorStop(0.5, this.color);
            abdomenGradient.addColorStop(1, '#000000');
            ctx.fillStyle = abdomenGradient;
            ctx.beginPath();
            ctx.ellipse(screenX, segmentY, size * 0.8 * segmentSize, size * 0.5 * segmentSize, 0, 0, Math.PI * 2);
            ctx.fill();

            // Segment shine
            ctx.fillStyle = 'rgba(255, 100, 100, 0.1)';
            ctx.beginPath();
            ctx.ellipse(screenX - size * 0.3, segmentY - size * 0.1, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Thorax
        const thoraxGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 0.6);
        thoraxGradient.addColorStop(0, '#A52A2A');
        thoraxGradient.addColorStop(0.5, this.color);
        thoraxGradient.addColorStop(1, '#000000');
        ctx.fillStyle = thoraxGradient;
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.6, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head with gradient
        const headGradient = ctx.createRadialGradient(screenX, screenY - size * 0.45, size * 0.15, screenX, screenY - size * 0.45, size * 0.45);
        headGradient.addColorStop(0, '#A52A2A');
        headGradient.addColorStop(0.5, this.color);
        headGradient.addColorStop(1, '#000000');
        ctx.fillStyle = headGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY - size * 0.45, size * 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (glowing red compound eyes)
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.25, screenY - size * 0.5, size * 0.12, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.25, screenY - size * 0.5, size * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Eye glow
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.22, screenY - size * 0.53, size * 0.05, 0, Math.PI * 2);
        ctx.arc(screenX + size * 0.28, screenY - size * 0.53, size * 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX - size * 0.2, screenY - size * 0.75);
        ctx.quadraticCurveTo(screenX - size * 0.4, screenY - size * 1.0, screenX - size * 0.6, screenY - size * 1.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screenX + size * 0.2, screenY - size * 0.75);
        ctx.quadraticCurveTo(screenX + size * 0.4, screenY - size * 1.0, screenX + size * 0.6, screenY - size * 1.1);
        ctx.stroke();

        ctx.restore();

        // Health bar
        const barWidth = size * 2.5;
        const barHeight = 5;
        const barX = screenX - barWidth / 2;
        const barY = screenY - size * 1.3;

        // Bar background
        ctx.fillStyle = '#222';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

        // Bar fill
        ctx.fillStyle = '#f00';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        const healthGradient = ctx.createLinearGradient(barX, barY, barX + barWidth * (this.health / this.maxHealth), barY);
        healthGradient.addColorStop(0, '#f00');
        healthGradient.addColorStop(1, '#f00');
        ctx.fillStyle = healthGradient;
        ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
    }
}

class EnemyAnt extends Ant {
    constructor(x, y, queen) {
        super(x, y, false);
        this.color = '#FF0000'; // Bright red - very menacing
        this.size = 0.9; // 50% bigger than original (0.6) for better visibility
        this.speed = 2; // Slower than friendly workers (friendly workers have speed 3)
        this.queen = queen; // Reference to enemy queen
        this.aggroRange = 4; // Reduced so they focus on food gathering unless very close
        this.attackRange = 1.5; // Increased from 1.2 for more reliable combat
        this.attackCooldown = 0;
        this.target = null;
        this.wanderTimer = 0;
        this.wanderX = x;
        this.wanderY = y;
        this.carryingFood = false;
        this.foodAmount = 0;
        this.targetFood = null;
        this.state = 'idle';
    }

    update(dt, input, game) {
        if (!this.alive) return;

        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.wanderTimer -= dt;

        // Enemy worker AI: prioritize fighting over food gathering
        // First check if any friendly ants are nearby to attack
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
            // Attack mode - drop food if carrying to attack
            if (this.carryingFood) {
                // Spawn dropped food on ground
                game.foodSources.push(new FoodSource(this.x, this.y, this.foodAmount));
                this.carryingFood = false;
                this.foodAmount = 0;
                this.targetFood = null;
            }

            this.target = nearest;

            this.moveTowards(nearest.x, nearest.y, dt, game);

            // Recalculate distance after moving to check for attack
            const dx = nearest.x - this.x;
            const dy = nearest.y - this.y;
            const currentDist = Math.sqrt(dx * dx + dy * dy);

            if (currentDist < this.attackRange && this.attackCooldown === 0) {
                const damage = 8;
                nearest.takeDamage(damage, game);
                this.attackCooldown = 1;
                game.spawnHitParticles(nearest.x, nearest.y);
                game.screenShake.intensity = 10;
            }
        } else if (this.carryingFood && this.queen && this.queen.alive) {
            // Return food to enemy queen
            this.moveTowards(this.queen.x, this.queen.y, dt, game);

            const dx = this.queen.x - this.x;
            const dy = this.queen.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 2.5) {
                this.queen.food += this.foodAmount;
                this.foodAmount = 0;
                this.carryingFood = false;
                this.targetFood = null;
                this.state = 'idle';
                game.spawnFoodParticles(this.queen.x, this.queen.y);
            }
        } else if (!this.carryingFood) {
            // Look for food
            if (!this.targetFood || this.targetFood.amount === 0) {
                // Find nearest food
                let nearestFood = null;
                let nearestFoodDist = Infinity;

                for (let food of game.foodSources) {
                    if (food.amount > 0) {
                        const dx = food.x - this.x;
                        const dy = food.y - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < nearestFoodDist) {
                            nearestFoodDist = dist;
                            nearestFood = food;
                        }
                    }
                }

                this.targetFood = nearestFood;
            }

            if (this.targetFood) {
                this.moveTowards(this.targetFood.x, this.targetFood.y, dt, game);

                const dx = this.targetFood.x - this.x;
                const dy = this.targetFood.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 1.5 && this.targetFood.amount > 0) {
                    const taken = Math.min(5, this.targetFood.amount); // Enemy workers carry only 5 food
                    this.targetFood.amount -= taken;
                    this.foodAmount = taken;
                    this.carryingFood = true;
                    this.state = 'carrying';
                    game.spawnFoodParticles(this.x, this.y);
                }
            } else if (this.queen && this.queen.alive) {
                // Wander near queen
                const dx = this.queen.x - this.x;
                const dy = this.queen.y - this.y;
                const distFromQueen = Math.sqrt(dx * dx + dy * dy);

                if (distFromQueen > 10) {
                    // Return to queen area
                    this.moveTowards(this.queen.x, this.queen.y, dt, game);
                } else {
                    // Wander
                    if (this.wanderTimer <= 0) {
                        const angle = Math.random() * Math.PI * 2;
                        this.wanderX = this.queen.x + Math.cos(angle) * 8;
                        this.wanderY = this.queen.y + Math.sin(angle) * 8;
                        this.wanderTimer = 3 + Math.random() * 2;
                    }
                    this.moveTowards(this.wanderX, this.wanderY, dt, game);
                }
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
                // Blocked - dig to clear path (enemy ants can dig)
                // For diagonal movement, dig both X and Y directions
                if (Math.abs(dirX) > 0.1 && Math.abs(dirY) > 0.1) {
                    // Diagonal - dig both directions to prevent getting stuck
                    game.digTile(this.x + dirX * 0.6, this.y, dt * 6);
                    game.digTile(this.x, this.y + dirY * 0.6, dt * 6);
                }
                // Always dig in the movement direction
                game.digTile(this.x + dirX * 0.6, this.y + dirY * 0.6, dt * 8);
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

        // Draw food as seeds/berries pile
        this.pulseTimer += 0.05;
        const pulse = Math.sin(this.pulseTimer) * 0.05 + 1;
        const size = (8 + (this.amount / this.maxAmount) * 6) * pulse;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(screenX + 1, screenY + size * 0.6, size * 0.9, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw multiple seed/berry pieces
        const pieceCount = Math.min(8, Math.ceil(this.amount / 15));
        for (let i = 0; i < pieceCount; i++) {
            const angle = (i / pieceCount) * Math.PI * 2 + this.pulseTimer * 0.1;
            const dist = size * 0.3 * Math.sin(i * 2.4);
            const px = screenX + Math.cos(angle) * dist;
            const py = screenY + Math.sin(angle) * dist * 0.5;
            const pieceSize = size * (0.5 + Math.sin(i * 1.7) * 0.2);

            // Seed/berry body
            const gradient = ctx.createRadialGradient(px - pieceSize * 0.2, py - pieceSize * 0.2, 0, px, py, pieceSize);
            gradient.addColorStop(0, '#FFE082');
            gradient.addColorStop(0.7, '#FFB74D');
            gradient.addColorStop(1, '#F57C00');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(px, py, pieceSize, 0, Math.PI * 2);
            ctx.fill();

            // Highlight
            ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
            ctx.beginPath();
            ctx.arc(px - pieceSize * 0.3, py - pieceSize * 0.3, pieceSize * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Central main piece (larger)
        const mainGradient = ctx.createRadialGradient(screenX - size * 0.2, screenY - size * 0.2, 0, screenX, screenY, size);
        mainGradient.addColorStop(0, '#FFECB3');
        mainGradient.addColorStop(0.6, '#FFB74D');
        mainGradient.addColorStop(1, '#F57C00');
        ctx.fillStyle = mainGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 0.8, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#E65100';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(screenX - size * 0.3, screenY - size * 0.3, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
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
            // Star sparkle effect with glow
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, this.size * 2);
            gradient.addColorStop(0, this.color);
            gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size * 2, 0, Math.PI * 2);
            ctx.fill();

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

            // Bright center
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, this.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'glow') {
            // Glowing ring particle
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, this.size * 1.5);
            gradient.addColorStop(0, this.color);
            gradient.addColorStop(0.5, this.color.replace('0.8', '0.4'));
            gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size * 1.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'flash') {
            // Impact flash
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, this.size);
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.3, this.color);
            gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'cloud') {
            // Dust cloud
            const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, this.size);
            gradient.addColorStop(0, this.color);
            gradient.addColorStop(1, 'rgba(139, 69, 19, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'dust') {
            // Soft dust particle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Dirt chunk with rotation and gradient
            ctx.translate(screenX, screenY);
            ctx.rotate(this.rotation);

            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(-this.size / 2 + 1, -this.size / 2 + 1, this.size, this.size);

            // Main chunk
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);

            // Highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size / 2, this.size / 2);
        }

        ctx.restore();
    }
}

// Start the game
window.addEventListener('load', () => {
    new Game();
});
