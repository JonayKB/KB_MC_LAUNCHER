/* Mundo isométrico del hero: se construye bloque a bloque mientras avanza la
   instalación de ejemplo. Las texturas se generan aquí, sin imágenes externas. */
(() => {
    const canvas = document.getElementById("world");
    const hero = document.getElementById("top");
    const stage = document.getElementById("hero-stage");
    if (!canvas || !canvas.getContext || !hero || !stage) return;

    const ctx = canvas.getContext("2d");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const SIZE = 12;
    const BUILD_MS = 8000;
    const DROP_MS = 460;
    const AMBIENT_MS = 125; // agua y antorchas a 8 pasos por segundo

    const STEPS = [
        { until: 0.10, text: "Descargando Java 17..." },
        { until: 0.30, text: "Descargando Minecraft 1.20.1..." },
        { until: 0.44, text: "Descargando Forge..." },
        { until: 0.74, text: "Descargando mods..." },
        { until: 0.90, text: "Extrayendo mods..." },
        { until: 1.00, text: "Descargando overrides..." }
    ];

    /* ── Azar con semilla: el mundo es siempre el mismo ──────────── */

    function seeded(seed) {
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ── Texturas de 16×16 ───────────────────────────────────────── */

    function texture(seed, paint) {
        const tex = document.createElement("canvas");
        tex.width = tex.height = 16;
        const pen = tex.getContext("2d");
        const random = seeded(seed);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const [r, g, b] = paint(x, y, random);
                const shift = (random() - 0.5) * 16;
                pen.fillStyle = `rgb(${r + shift | 0},${g + shift | 0},${b + shift | 0})`;
                pen.fillRect(x, y, 1, 1);
            }
        }
        return tex;
    }

    const DIRT = [108, 78, 56];
    const GRASS = [72, 124, 62];
    const STONE = [98, 100, 110];

    const flat = color => () => color;
    const stone = (x, y, random) => (random() < 0.16 ? [84, 86, 96] : STONE);

    const textures = {
        grassTop: texture(1, (x, y, random) => (random() < 0.2 ? [58, 106, 52] : GRASS)),
        grassSide: texture(2, (x, y, random) => (y < 3 + ((x * 7) % 3) ? GRASS : (random() < 0.2 ? [90, 64, 46] : DIRT))),
        dirt: texture(3, (x, y, random) => (random() < 0.2 ? [90, 64, 46] : DIRT)),
        stone: texture(4, stone),
        ore: texture(5, (x, y, random) => {
            const cluster = [[4, 4], [11, 6], [6, 11], [12, 12]].some(([cx, cy]) => Math.abs(x - cx) + Math.abs(y - cy) < 2);
            return cluster ? [232, 25, 44] : stone(x, y, random);
        }),
        logSide: texture(6, x => (x % 4 === 1 ? [74, 54, 36] : [98, 72, 46])),
        logTop: texture(7, (x, y) => (Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) % 3 < 1 ? [108, 84, 54] : [150, 118, 76])),
        leaves: texture(8, (x, y, random) => (random() < 0.28 ? [30, 70, 42] : [46, 100, 58])),
        planks: texture(9, (x, y) => (y % 4 === 3 ? [104, 72, 44] : [150, 108, 66])),
        roof: texture(10, (x, y) => (y % 4 === 3 ? [46, 30, 28] : [78, 50, 44])),
        cobble: texture(11, (x, y) => ((x + (y >> 2) * 5) % 5 === 0 || y % 4 === 0 ? [66, 68, 76] : [112, 114, 122])),
        door: texture(12, (x, y) => (x === 0 || x === 15 || y === 0 || y === 8 || y === 15 ? [60, 40, 28] : (x === 12 && y === 9 ? [220, 200, 120] : [104, 72, 44]))),
        window: texture(13, (x, y) => (x < 2 || x > 13 || y < 2 || y > 13 ? [104, 72, 44] : (x === 7 || x === 8 || y === 7 || y === 8 ? [120, 84, 52] : [255, 196, 96]))),
        wool: texture(14, flat([232, 25, 44]))
    };

    const water = [0, 1, 2, 3].map(frame => texture(20 + frame, (x, y) => {
        const wave = Math.sin((x + y * 2) * 0.8 + frame * Math.PI / 2);
        return wave > 0.6 ? [70, 130, 196] : [40, 92, 156];
    }));

    const BLOCKS = {
        grass: { top: textures.grassTop, side: textures.grassSide },
        dirt: { top: textures.dirt, side: textures.dirt },
        stone: { top: textures.stone, side: textures.stone },
        ore: { top: textures.ore, side: textures.ore },
        log: { top: textures.logTop, side: textures.logSide },
        leaves: { top: textures.leaves, side: textures.leaves },
        planks: { top: textures.planks, side: textures.planks },
        roof: { top: textures.roof, side: textures.roof },
        cobble: { top: textures.cobble, side: textures.cobble },
        door: { top: textures.planks, side: textures.door },
        window: { top: textures.planks, side: textures.window },
        wool: { top: textures.wool, side: textures.wool }
    };

    water.forEach((tex, i) => {
        BLOCKS[`water${i}`] = { top: tex, side: tex };
    });

    function averageColor(tex) {
        const data = tex.getContext("2d").getImageData(0, 0, 16, 16).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
            sum[0] += data[i];
            sum[1] += data[i + 1];
            sum[2] += data[i + 2];
        }
        return `rgb(${sum.map(v => v / 256 | 0).join(",")})`;
    }

    /* ── El terreno ──────────────────────────────────────────────── */

    const blocks = [];
    const solid = new Map();
    let peak = 0;

    const keyOf = (x, y, z) => `${x},${y},${z}`;

    function put(x, y, z, type) {
        const random = worldRandom();
        const block = { x, y, z, type, start: 0, order: x + y + z, seed: random };
        blocks.push(block);
        solid.set(keyOf(x, y, z), block);
        peak = Math.max(peak, z);
    }

    function clear(x, y, z) {
        const key = keyOf(x, y, z);
        const block = solid.get(key);
        if (!block) return;
        solid.delete(key);
        blocks.splice(blocks.indexOf(block), 1);
    }

    let worldRandom = seeded(7);

    function groundHeight(x, y) {
        if (x <= 6 && y <= 6) return 4; // explanada de la casa
        const wave = 1.1 * Math.sin(x * 0.75 + 1) + 0.9 * Math.cos(y * 0.62 + 0.5) + 0.5 * Math.sin((x + y) * 0.45);
        return 4 + Math.round(wave);
    }

    const isPond = (x, y) => Math.hypot(x - 9, y - 9) < 2.7;

    function buildHouse() {
        const [from, to, base] = [1, 5, 5];
        for (let x = from; x <= to; x++) {
            for (let y = from; y <= to; y++) {
                const edge = x === from || x === to || y === from || y === to;
                const corner = (x === from || x === to) && (y === from || y === to);
                put(x, y, base - 1, "cobble");
                if (edge) {
                    for (let z = base; z < base + 3; z++) put(x, y, z, corner ? "log" : "planks");
                }
            }
        }
        clear(3, to, base);
        clear(3, to, base + 1);
        put(3, to, base, "door");
        put(3, to, base + 1, "door");
        clear(to, 3, base + 1);
        put(to, 3, base + 1, "window");
        clear(1, to, base + 1);
        put(1, to, base + 1, "log");

        for (let x = from - 1; x <= to + 1; x++) {
            for (let y = from - 1; y <= to + 1; y++) {
                if (x < 0 || y < 0) continue;
                put(x, y, base + 3, "roof");
                const inner = x >= from + 1 && x <= to - 1 && y >= from + 1 && y <= to - 1;
                if (inner) put(x, y, base + 4, "roof");
            }
        }
        put(3, 3, base + 5, "wool");
    }

    function buildTree(x, y) {
        const ground = groundHeight(x, y);
        for (let z = 1; z <= 3; z++) put(x, y, ground + z, "log");
        const crown = ground + 4;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
                if (Math.abs(dx) + Math.abs(dy) > 3) continue;
                put(nx, ny, crown, "leaves");
                if (Math.abs(dx) + Math.abs(dy) <= 1) put(nx, ny, crown + 1, "leaves");
            }
        }
    }

    function generate() {
        blocks.length = 0;
        solid.clear();
        peak = 0;
        worldRandom = seeded(7);

        for (let x = 0; x < SIZE; x++) {
            for (let y = 0; y < SIZE; y++) {
                const pond = isPond(x, y);
                const top = pond ? 3 : groundHeight(x, y);
                for (let z = 0; z <= top; z++) {
                    let type = "dirt";
                    if (z < top - 1) type = worldRandom() < 0.13 ? "ore" : "stone";
                    if (z === top) type = pond ? "water0" : "grass";
                    put(x, y, z, type);
                }
            }
        }

        buildHouse();
        buildTree(9, 2);
        buildTree(2, 9);

        // Primero el suelo y después lo de encima, con un poco de desorden
        for (const block of blocks) {
            block.start = (block.z / (peak + 1)) * 0.84 + block.seed * 0.12;
        }
        refreshVisibility();
    }

    let visible = [];
    const decorations = [
        { x: 7, y: 3, kind: "torch" },
        { x: 1, y: 7, kind: "torch" },
        { x: 7, y: 7, kind: "torch" },
        { x: 4, y: 7, kind: "player" }
    ];

    // El suelo de esa columna, por debajo de copas de árbol y aleros
    function surface(x, y) {
        for (let z = peak; z >= 0; z--) {
            const block = solid.get(keyOf(x, y, z));
            if (block && block.type !== "leaves" && block.type !== "roof") return z;
        }
        return -1;
    }

    function refreshVisibility() {
        const items = blocks.filter(b => !solid.has(keyOf(b.x + 1, b.y, b.z))
            || !solid.has(keyOf(b.x, b.y + 1, b.z))
            || !solid.has(keyOf(b.x, b.y, b.z + 1)));

        for (const item of decorations) {
            const z = surface(item.x, item.y) + 1;
            if (z < 1) continue;
            items.push({ ...item, z, order: item.x + item.y + z, decoration: true, start: item.kind === "player" ? 1.02 : 0.97 });
        }

        visible = items.sort((a, b) => a.order - b.order);
    }

    /* ── Sprites ─────────────────────────────────────────────────── */

    let dpr = 1;
    let unit = 20; // medio ancho de la cara superior
    let blockHeight = 24;
    let originX = 0;
    let originY = 0;
    let width = 0;
    let height = 0;
    let sprites = {};
    let glowSprite = null;
    let sky = null;

    function drawFaces(pen, block) {
        const overlap = 16.3; // evita rendijas entre caras al escalar
        const faces = [
            { tex: block.top, shade: 0.06, matrix: [unit / 16, unit / 32, -unit / 16, unit / 32, unit, 0] },
            { tex: block.side, shade: 0.34, matrix: [unit / 16, unit / 32, 0, blockHeight / 16, 0, unit / 2] },
            { tex: block.side, shade: 0.54, matrix: [unit / 16, -unit / 32, 0, blockHeight / 16, unit, unit] }
        ];

        for (const { tex, shade, matrix } of faces) {
            pen.save();
            pen.transform(...matrix);
            pen.drawImage(tex, 0, 0, 16, 16, 0, 0, overlap, overlap);
            pen.fillStyle = `rgba(8,10,24,${shade})`;
            pen.fillRect(0, 0, overlap, overlap);
            pen.restore();
        }
    }

    function makeSprite(paint) {
        const sprite = document.createElement("canvas");
        sprite.width = Math.ceil((unit * 2 + 1) * dpr);
        sprite.height = Math.ceil((unit + blockHeight + 1) * dpr);
        const pen = sprite.getContext("2d");
        pen.imageSmoothingEnabled = false;
        pen.scale(dpr, dpr);
        paint(pen);
        return sprite;
    }

    function drawTorch(pen) {
        const w = Math.max(2, unit * 0.13);
        const top = blockHeight * 0.42;
        pen.fillStyle = "#6a4a2c";
        pen.fillRect(unit - w / 2, top, w, unit * 0.86);
        pen.fillStyle = "#ffd27a";
        pen.fillRect(unit - w * 0.7, top - w * 1.2, w * 1.4, w * 1.5);
    }

    function drawPlayer(pen) {
        // Una figura sencilla con la camiseta de KB
        const w = unit * 0.5;
        const left = unit - w / 2;
        pen.fillStyle = "#2c3350";
        pen.fillRect(left, blockHeight * 0.92, w, unit * 0.62);
        pen.fillStyle = "#c8162a";
        pen.fillRect(left, blockHeight * 0.34, w, blockHeight * 0.6);
        pen.fillStyle = "#d8a67c";
        pen.fillRect(left + w * 0.1, blockHeight * 0.34 - w * 0.8, w * 0.8, w * 0.8);
        pen.fillStyle = "#3a2a20";
        pen.fillRect(left + w * 0.1, blockHeight * 0.34 - w * 0.8, w * 0.8, w * 0.26);
    }

    function bakeSprites() {
        sprites = {};
        for (const [name, block] of Object.entries(BLOCKS)) {
            sprites[name] = makeSprite(pen => drawFaces(pen, block));
        }
        sprites.torch = makeSprite(drawTorch);
        sprites.player = makeSprite(drawPlayer);

        const radius = Math.ceil(unit * 3.2 * dpr);
        glowSprite = document.createElement("canvas");
        glowSprite.width = glowSprite.height = radius * 2;
        const pen = glowSprite.getContext("2d");
        const gradient = pen.createRadialGradient(radius, radius, 0, radius, radius, radius);
        gradient.addColorStop(0, "rgba(255,176,88,.42)");
        gradient.addColorStop(1, "rgba(255,176,88,0)");
        pen.fillStyle = gradient;
        pen.fillRect(0, 0, radius * 2, radius * 2);
    }

    function bakeSky(stageX, stageY, stageWidth) {
        // Sin estrellas detrás del texto
        const box = hero.getBoundingClientRect();
        const copy = document.querySelector(".hero-content").getBoundingClientRect();
        const text = {
            left: copy.left - box.left - 16,
            right: copy.right - box.left + 16,
            top: copy.top - box.top - 16,
            bottom: copy.bottom - box.top + 16
        };

        sky = document.createElement("canvas");
        sky.width = canvas.width;
        sky.height = canvas.height;
        const pen = sky.getContext("2d");
        pen.scale(dpr, dpr);

        const random = seeded(3);
        const count = Math.round(width * height / 14000);
        for (let i = 0; i < count; i++) {
            const size = random() < 0.2 ? 3 : 2;
            const alpha = 0.12 + random() * 0.4;
            const x = random() * width | 0;
            const y = random() * height * 0.8 | 0;
            if (x > text.left && x < text.right && y > text.top && y < text.bottom) continue;
            pen.fillStyle = `rgba(226,230,245,${alpha})`;
            pen.fillRect(x, y, size, size);
        }

        // Luna cuadrada, en la zona libre encima del mundo
        const moon = Math.min(64, stageWidth * 0.1) | 0;
        const moonX = stageX + stageWidth * 0.84 | 0;
        const moonY = Math.max(24, stageY - moon * 0.2) | 0;
        pen.fillStyle = "#c6cadc";
        pen.fillRect(moonX, moonY, moon, moon);
        pen.fillStyle = "#a9aec6";
        const pixel = Math.max(4, moon / 8 | 0);
        for (const [px, py] of [[1, 1], [2, 1], [5, 2], [1, 5], [2, 5], [5, 5], [6, 5], [3, 3]]) {
            pen.fillRect(moonX + px * pixel, moonY + py * pixel, pixel, pixel);
        }
    }

    function resize() {
        const box = hero.getBoundingClientRect();
        const rect = stage.getBoundingClientRect();
        const stageX = rect.left - box.left;
        const stageY = rect.top - box.top;

        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = box.width;
        height = box.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        const tall = SIZE + (peak + 2) * 1.22 + 1;
        unit = Math.max(8, Math.min(30, Math.floor(Math.min(rect.width / (SIZE * 2 + 1), rect.height / tall))));
        blockHeight = Math.round(unit * 1.22);
        originX = Math.round(stageX + rect.width / 2);
        originY = Math.round(stageY + (peak + 2) * blockHeight);

        bakeSprites();
        bakeSky(stageX, stageY, rect.width);
        dirty = true;
    }

    /* ── Dibujo ──────────────────────────────────────────────────── */

    const screenX = item => originX + (item.x - item.y) * unit;
    const screenY = item => originY + (item.x + item.y) * unit / 2 - item.z * blockHeight;
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    let waterFrame = 0;
    let tick = 0;
    let startedAt = 0;
    let dirty = true;
    let hovered = null;
    let particles = [];

    function elapsed(now) {
        return reducedMotion ? Infinity : now - startedAt;
    }

    function spriteFor(item) {
        if (item.decoration) return sprites[item.kind];
        return item.type === "water0" ? sprites[`water${waterFrame}`] : sprites[item.type];
    }

    function drawItem(item, time) {
        const appear = (time - item.start * BUILD_MS) / DROP_MS;
        if (appear <= 0) return;

        const eased = easeOut(Math.min(appear, 1));
        const drop = (1 - eased) * -unit * 3;
        ctx.globalAlpha = Math.min(1, appear * 3);
        ctx.drawImage(spriteFor(item), screenX(item) - unit, screenY(item) + drop, unit * 2 + 1, unit + blockHeight + 1);
    }

    function drawGlows(time) {
        const light = Math.min(1, (time - BUILD_MS * 0.97) / 900);
        if (light <= 0) return;

        ctx.globalCompositeOperation = "lighter";
        const size = glowSprite.width / dpr;
        const sources = visible.filter(item => item.kind === "torch" || item.type === "window");
        for (const source of sources) {
            const flicker = 0.9 + 0.1 * Math.sin(tick * 1.7 + source.order * 2.3);
            ctx.globalAlpha = light * flicker;
            ctx.drawImage(glowSprite, screenX(source) - size / 2, screenY(source) + unit / 2 - size / 2, size, size);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    }

    function drawOutline(block) {
        const x = screenX(block);
        const y = screenY(block);
        ctx.strokeStyle = "rgba(0,0,0,.72)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + unit, y + unit / 2);
        ctx.lineTo(x + unit, y + unit / 2 + blockHeight);
        ctx.lineTo(x, y + unit + blockHeight);
        ctx.lineTo(x - unit, y + unit / 2 + blockHeight);
        ctx.lineTo(x - unit, y + unit / 2);
        ctx.closePath();
        ctx.moveTo(x - unit, y + unit / 2);
        ctx.lineTo(x, y + unit);
        ctx.lineTo(x + unit, y + unit / 2);
        ctx.moveTo(x, y + unit);
        ctx.lineTo(x, y + unit + blockHeight);
        ctx.stroke();
    }

    function drawParticles() {
        for (const p of particles) {
            p.vy += 0.34;
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 1;
            ctx.globalAlpha = Math.min(1, p.life / 12);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        particles = particles.filter(p => p.life > 0);
    }

    function render(now) {
        const time = elapsed(now);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        if (sky) ctx.drawImage(sky, 0, 0, width, height);

        for (const item of visible) drawItem(item, time);
        ctx.globalAlpha = 1;

        drawGlows(time);
        if (hovered) drawOutline(hovered);
        drawParticles();
    }

    /* ── Tarjeta de instalación ──────────────────────────────────── */

    const install = document.getElementById("install");
    const stepLabel = document.getElementById("install-step");
    const percentLabel = document.getElementById("install-percent");
    const cells = [...document.querySelectorAll("#install-blocks i")];
    let shownPercent = -1;

    function updateInstall(time) {
        const progress = Math.min(1, time / BUILD_MS);
        const percent = Math.floor(progress * 100);
        const ready = progress >= 1;

        if (percent !== shownPercent) {
            shownPercent = percent;
            percentLabel.textContent = `${percent}%`;
            const index = STEPS.findIndex(step => progress < step.until);
            stepLabel.textContent = ready ? "Listo para jugar." : `Paso ${index + 1}/${STEPS.length} · ${STEPS[index].text}`;
            cells.forEach((cell, i) => cell.classList.toggle("on", i < progress * cells.length));
        }

        install.classList.toggle("is-ready", ready);
    }

    /* ── Bucle ───────────────────────────────────────────────────── */

    let running = false;
    let onScreen = true;
    let lastAmbient = 0;

    function frame(now) {
        if (!onScreen || document.hidden) {
            running = false;
            return;
        }
        requestAnimationFrame(frame);

        const time = elapsed(now);
        const building = time < BUILD_MS * 1.04 + DROP_MS + 900;
        const ambient = now - lastAmbient >= AMBIENT_MS;

        if (ambient) {
            lastAmbient = now;
            tick++;
            if (tick % 3 === 0) waterFrame = (waterFrame + 1) % water.length;
        }

        if (building || ambient || dirty || particles.length) {
            dirty = false;
            render(now);
            updateInstall(time);
        }
    }

    function start() {
        if (running || reducedMotion) return;
        running = true;
        requestAnimationFrame(frame);
    }

    function restart() {
        generate();
        hovered = null;
        particles = [];
        shownPercent = -1;
        startedAt = performance.now();
        dirty = true;
        if (reducedMotion) {
            render(0);
            updateInstall(Infinity);
        }
        start();
    }

    /* ── Romper bloques ──────────────────────────────────────────── */

    function pick(clientX, clientY) {
        const box = canvas.getBoundingClientRect();
        const x = clientX - box.left;
        const y = clientY - box.top;

        for (let i = visible.length - 1; i >= 0; i--) {
            const item = visible[i];
            if (item.decoration) continue;
            const dx = Math.abs(x - screenX(item));
            if (dx > unit) continue;
            const dy = y - screenY(item);
            if (dy >= dx / 2 && dy <= unit + blockHeight - dx / 2) return item;
        }
        return null;
    }

    function worldIsBuilt() {
        return elapsed(performance.now()) >= BUILD_MS;
    }

    function blockedByInterface(target) {
        return Boolean(target.closest("a, button, .install, .hero-content > *"));
    }

    function breakBlock(block) {
        solid.delete(keyOf(block.x, block.y, block.z));
        blocks.splice(blocks.indexOf(block), 1);
        refreshVisibility();

        const color = averageColor(BLOCKS[block.type].top);
        const x = screenX(block);
        const y = screenY(block) + unit / 2;
        for (let i = 0; i < 14; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * unit,
                y: y + (Math.random() - 0.5) * blockHeight,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 4,
                size: 3 + (Math.random() * 3 | 0),
                life: 24 + (Math.random() * 16 | 0),
                color
            });
        }
        hovered = null;
        dirty = true;
        start();
    }

    if (window.matchMedia("(pointer: fine)").matches) {
        hero.addEventListener("pointermove", event => {
            const next = worldIsBuilt() && !blockedByInterface(event.target) ? pick(event.clientX, event.clientY) : null;
            if (next !== hovered) {
                hovered = next;
                dirty = true;
                hero.classList.toggle("is-mining", Boolean(next));
                if (reducedMotion) render(0);
            }
        });

        hero.addEventListener("pointerleave", () => {
            hovered = null;
            dirty = true;
            hero.classList.remove("is-mining");
            if (reducedMotion) render(0);
        });
    }

    hero.addEventListener("click", event => {
        if (!worldIsBuilt() || blockedByInterface(event.target)) return;
        const block = pick(event.clientX, event.clientY);
        if (!block) return;
        breakBlock(block);
        if (reducedMotion) render(0);
    });

    document.getElementById("world-replay").addEventListener("click", restart);

    /* ── Arranque ────────────────────────────────────────────────── */

    generate();
    resize();

    new ResizeObserver(() => {
        const box = hero.getBoundingClientRect();
        if (box.width === width && box.height === height) return;
        resize();
        if (reducedMotion) render(0);
    }).observe(hero);

    new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
    }).observe(hero);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) start();
    });

    // En móvil el mundo queda bajo el texto: se construye cuando llega a verse
    const firstView = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        firstView.disconnect();
        restart();
    }, { threshold: 0.3 });
    firstView.observe(stage);
})();
