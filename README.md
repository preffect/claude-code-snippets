# Ant Colony Game

A mobile-friendly browser game where you play as a worker ant building and defending your colony!

## How to Play

### Getting Started
1. Open `index.html` in a web browser (works on desktop and mobile)
2. You start as a single worker ant (with cyan circle around it)
3. Your queen is the larger brown ant with a gold crown

### Controls

**Mobile:**
- Use the touch joystick in the bottom-left corner to move your ant
- Move into dirt to automatically dig tunnels

**Desktop:**
- Use Arrow Keys or WASD to move
- Move into dirt to automatically dig tunnels

### Objective

Your goal is to build and grow your ant colony while defending it from hostile invaders!

### Game Mechanics

#### 1. Collecting Food
- Yellow blobs scattered underground are food sources
- Walk into food to pick up a portion (you'll see a yellow dot on your ant)
- Return to the queen to deposit food
- Each food delivery gives you points

#### 2. Growing Your Colony
- The queen needs 20 food to spawn a new worker ant
- New workers spawn every 10 seconds if there's enough food
- AI workers automatically search for food and bring it back
- More workers = faster food collection

#### 3. Digging Tunnels
- Move into brown dirt tiles to dig
- Deeper dirt is harder to dig (takes longer)
- Create paths to reach food and expand your colony
- AI workers will dig through obstacles to reach food

#### 4. Combat
- Red enemy ants guard some underground chambers
- They will attack if you get too close (within 5 tiles)
- Your worker ants will automatically fight enemies
- Enemies can hurt you - watch your health bar!
- Your AI workers will help fight invaders

#### 5. Death and Game Over
- If your health reaches 0, it's game over
- Keep your distance from multiple enemies
- Use your worker ants to gang up on enemies

### UI Elements

- **Food:** Total food stored in your colony
- **Workers:** Number of living worker ants (including you)
- **Health:** Your current health (starts at 100)

### Tips

- Explore carefully - enemy nests can be dangerous alone
- Bring workers with you for protection
- Food sources have limited amounts - find multiple sources
- The queen is stationary - protect her position
- Deeper underground has more enemies but also more food

## Technical Details

This game is built with:
- Vanilla JavaScript (no dependencies)
- HTML5 Canvas for rendering
- Touch and mouse input support
- Responsive design for mobile and desktop

## File Structure

```
├── index.html    # Main game page
├── styles.css    # Game styling and UI
├── game.js       # Complete game logic
└── README.md     # This file
```

All game code is self-contained - no external dependencies required!

## Browser Compatibility

Works on all modern browsers:
- Chrome/Edge (desktop & mobile)
- Firefox (desktop & mobile)
- Safari (desktop & mobile)

Optimized for mobile touch screens with virtual joystick controls.

---

Enjoy building your ant colony! 🐜
