const REPO = "JonayKB/KB_MC_LAUNCHER";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function formatRelativeDate(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    const units = [
        { limit: 60, divisor: 1, singular: "segundo" },
        { limit: 3600, divisor: 60, singular: "minuto" },
        { limit: 86400, divisor: 3600, singular: "hora" },
        { limit: 2592000, divisor: 86400, singular: "día" },
        { limit: 7776000, divisor: 2592000, singular: "mes" } // hasta 3 meses (90 días)
    ];

    if (seconds < 10) return "justo ahora";

    for (const unit of units) {
        if (seconds < unit.limit) {
            const value = Math.floor(seconds / unit.divisor);
            const plural = unit.singular === "mes" ? "meses" : unit.singular + "s";
            return `hace ${value} ${value === 1 ? unit.singular : plural}`;
        }
    }

    return date.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

/* ── Sistema operativo del visitante ─────────────────────────── */

function detectOS() {
    const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
    const ua = navigator.userAgent.toLowerCase();

    if (/android|iphone|ipad/.test(ua)) return null;
    if (platform.includes("win") || ua.includes("windows")) return "windows";
    if (platform.includes("linux") || ua.includes("linux")) return "linux";
    return null;
}

function highlightPlatform() {
    const os = detectOS();
    if (!os) return;

    const card = document.querySelector(`.platform[data-os="${os}"]`);
    if (!card) return;

    card.classList.add("is-recommended");

    const label = document.getElementById("hero-download-label");
    label.textContent = os === "windows" ? "Descargar para Windows" : "Descargar para Linux";

    // En el hero, el botón descarga directamente el instalador principal.
    const primaryLink = card.querySelector(".download-btn");
    const heroButton = document.getElementById("hero-download");
    heroButton.href = primaryLink.href;
    heroButton.dataset.direct = "true";
}

/* ── Header ──────────────────────────────────────────────────── */

const header = document.getElementById("header");

function updateHeader() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

// Marca en la navegación la sección que se está viendo.
const navLinks = [...document.querySelectorAll(".nav-links a")];
const sectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) {
            link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
        }
    }
}, { rootMargin: "-45% 0px -50% 0px" });

navLinks.forEach(link => {
    const section = document.querySelector(link.getAttribute("href"));
    if (section) sectionObserver.observe(section);
});

/* ── Animaciones al hacer scroll ─────────────────────────────── */

function setupReveal() {
    const items = document.querySelectorAll(".reveal");

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
        items.forEach(el => el.classList.add("is-visible"));
        return;
    }

    // Escalonado entre elementos hermanos (tarjetas de funciones, plataformas...).
    document.querySelectorAll(".demo-grid, .feature-list, .platform-grid").forEach(group => {
        [...group.children].forEach((child, i) => {
            child.style.setProperty("--stagger", `${(i % 4) * 60}ms`);
        });
    });

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        }
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

    items.forEach(el => observer.observe(el));
}

/* ── Vídeos: solo se reproducen cuando están en pantalla ─────── */

function setupVideos() {
    const videos = document.querySelectorAll(".step-media video");

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            const video = entry.target;
            if (entry.isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        }
    }, { threshold: 0.35 });

    videos.forEach(video => {
        observer.observe(video);

        const media = video.closest(".step-media");
        video.addEventListener("timeupdate", () => {
            if (!video.duration) return;
            media.style.setProperty("--progress", (video.currentTime / video.duration).toFixed(3));
        });
    });
}

/* ── Utilidades de las demos ─────────────────────────────────── */

// Las demos solo corren en pantalla; sin movimiento se quedan en su estado final.
function whileVisible(element, onEnter, onLeave) {
    new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) onEnter();
        else onLeave?.();
    }, { threshold: 0.3 }).observe(element);
}

function makeBlocks(container, count) {
    container.innerHTML = "<i></i>".repeat(count);
    return [...container.children];
}

function tween(duration, update) {
    if (prefersReducedMotion) {
        update(1);
        return;
    }
    const started = performance.now();
    const step = now => {
        const t = Math.min(1, (now - started) / duration);
        update(1 - Math.pow(1 - t, 3));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/* ── Réplica de la Home ──────────────────────────────────────── */

function setupAppPreview() {
    const hour = new Date().getHours();
    let greeting = "Buenas tardes";
    if (hour < 7 || hour >= 21) greeting = "Buenas noches";
    else if (hour < 14) greeting = "Buenos días";

    setText("app-greeting", `${greeting}, Steve`);
    setText("app-date", new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }));

    const poll = document.getElementById("poll");
    const answers = [...poll.querySelectorAll(".poll-answer")];
    const total = answers.reduce((sum, answer) => sum + Number(answer.dataset.votes), 0);
    let played = false;

    const show = progress => {
        answers.forEach(answer => {
            const votes = Number(answer.dataset.votes);
            const percent = Math.round((votes / total) * 100);
            answer.querySelector("i").style.transform = `scaleX(${(votes / total) * progress})`;
            answer.querySelector("small").textContent = `${Math.round(votes * progress)} · ${Math.round(percent * progress)}%`;
        });
        setText("poll-total", Math.round(total * progress));
    };

    show(0);
    whileVisible(poll, () => {
        if (played) return;
        played = true;
        setTimeout(() => tween(1100, show), prefersReducedMotion ? 0 : 350);
    });
}

/* ── Consola ─────────────────────────────────────────────────── */

const CONSOLE_LINES = [
    ["INFO", "[main] Loading Minecraft 1.20.1 with Forge 47.4.10"],
    ["INFO", "[modloading] Found 212 mods to load"],
    ["INFO", "[modloading] Loading configs"],
    ["WARN", "[mixin] Mod 'exilecompat' uses an older config"],
    ["INFO", "[Render] OpenGL 4.6, 8192 MB allocated"],
    ["ERROR", "[modloading] Mod 'exilecompat' failed to load"]
];

function setupConsole() {
    const root = document.getElementById("console");
    const lines = document.getElementById("console-lines");
    const crash = document.getElementById("console-crash");
    let timer = 0;

    const addLine = ([level, text]) => {
        const line = document.createElement("div");
        line.className = `console-line is-${level.toLowerCase()}`;
        line.innerHTML = `<span></span><code></code>`;
        line.firstChild.textContent = level;
        line.lastChild.textContent = text;
        lines.append(line);
    };

    const reset = () => {
        clearTimeout(timer);
        lines.textContent = "";
        crash.classList.remove("is-visible");
    };

    const play = () => {
        reset();
        if (prefersReducedMotion) {
            CONSOLE_LINES.forEach(addLine);
            crash.classList.add("is-visible");
            return;
        }

        let index = 0;
        const next = () => {
            if (index < CONSOLE_LINES.length) {
                addLine(CONSOLE_LINES[index++]);
                timer = setTimeout(next, 420 + Math.random() * 360);
                return;
            }
            crash.classList.add("is-visible");
            timer = setTimeout(play, 6000);
        };
        next();
    };

    whileVisible(root, play, reset);
}

/* ── Cuenta atrás de un modpack anunciado ────────────────────── */

function setupReleaseDemo() {
    const root = document.getElementById("release-demo");
    const button = document.getElementById("release-button");
    let timer = 0;

    const unlock = () => {
        root.classList.add("is-released");
        button.textContent = "Instalar";
    };

    const play = () => {
        clearInterval(timer);
        root.classList.remove("is-released");
        if (prefersReducedMotion) {
            unlock();
            return;
        }

        let seconds = 9;
        button.textContent = `Disponible en ${seconds} s`;
        timer = setInterval(() => {
            seconds--;
            if (seconds > 0) {
                button.textContent = `Disponible en ${seconds} s`;
                return;
            }
            clearInterval(timer);
            unlock();
            timer = setTimeout(play, 5000);
        }, 1000);
    };

    whileVisible(root, play, () => {
        clearInterval(timer);
        clearTimeout(timer);
    });
}

/* ── Descargas en paralelo ───────────────────────────────────── */

function setupTransfers() {
    const root = document.getElementById("transfers");
    const rows = [...root.querySelectorAll(".transfer")].map(row => ({
        row,
        label: row.querySelector("small"),
        cells: makeBlocks(row.querySelector(".blocks"), 28),
        speed: Number(row.dataset.speed),
        stall: Number(row.dataset.stall) || 0,
        progress: 0,
        waited: 0
    }));
    let frame = 0;
    let last = 0;
    let doneFor = 0;

    const paint = item => {
        const lit = Math.floor(item.progress * item.cells.length);
        item.cells.forEach((cell, i) => cell.classList.toggle("on", i < lit));

        const stalled = item.row.classList.contains("is-stalled");
        item.label.textContent = stalled ? "Reanudando..." : `${Math.floor(item.progress * 100)}%`;
    };

    const update = now => {
        frame = requestAnimationFrame(update);
        if (now - last < 80) return; // los bloques avanzan a saltos, no hace falta más
        const delta = (now - last) / 1000;
        last = now;

        for (const item of rows) {
            const stalling = item.stall && item.progress >= item.stall && item.waited < 1.8;
            item.row.classList.toggle("is-stalled", Boolean(stalling));
            if (stalling) item.waited += delta;
            else item.progress = Math.min(1, item.progress + delta * item.speed / 10);
            paint(item);
        }

        if (rows.every(item => item.progress >= 1)) {
            doneFor += delta;
            if (doneFor > 2.5) {
                doneFor = 0;
                rows.forEach(item => {
                    item.progress = 0;
                    item.waited = 0;
                });
            }
        }
    };

    if (prefersReducedMotion) {
        rows.forEach(item => {
            item.progress = 1;
            paint(item);
        });
        return;
    }

    whileVisible(root, () => {
        cancelAnimationFrame(frame);
        last = performance.now();
        frame = requestAnimationFrame(update);
    }, () => cancelAnimationFrame(frame));
}

/* ── Java por versión ────────────────────────────────────────── */

function setupJavaDemo() {
    const list = document.getElementById("java");
    const rows = [...list.children];
    let index = 0;
    let timer = 0;

    const select = () => rows.forEach((row, i) => row.classList.toggle("is-active", i === index));
    select();
    if (prefersReducedMotion) return;

    whileVisible(list, () => {
        clearInterval(timer);
        timer = setInterval(() => {
            index = (index + 1) % rows.length;
            select();
        }, 1600);
    }, () => clearInterval(timer));
}

/* ── Raíl de pasos: se llena al bajar ────────────────────────── */

function setupStepsRail() {
    const rail = document.getElementById("steps-rail");
    if (!rail || prefersReducedMotion) {
        rail?.classList.add("is-full");
        return;
    }

    let queued = false;
    const update = () => {
        queued = false;
        const box = rail.getBoundingClientRect();
        const progress = (window.innerHeight * 0.6 - box.top) / box.height;
        rail.firstElementChild.style.transform = `scaleY(${Math.max(0, Math.min(1, progress)).toFixed(3)})`;
    };

    const request = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    };

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
}

/* ── Información de la última release ────────────────────────── */

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

async function loadReleaseInfo() {
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!response.ok) throw new Error(`GitHub API ${response.status}`);

        const release = await response.json();

        setText("version", release.tag_name);
        setText("hero-version", `${release.tag_name} disponible`);
        setText("app-version", `Launcher ${release.tag_name}`);
        setText("publish-date", formatRelativeDate(release.published_at));

        if (release.html_url) {
            document.getElementById("release-link").href = release.html_url;
        }

        const assets = release.assets || [];
        const linkByPattern = {
            "x64-setup.exe": 'a[href*="x64-setup.exe"]',
            ".msi": 'a[href*=".msi"]',
            "AppImage": 'a[href*="AppImage"]',
            ".deb": 'a[href*=".deb"]'
        };

        let installerCount = 0;

        for (const [pattern, selector] of Object.entries(linkByPattern)) {
            const asset = assets.find(a => a.name.includes(pattern));
            if (!asset) continue;

            installerCount++;
            document.querySelectorAll(selector).forEach(link => {
                link.href = asset.browser_download_url;
            });
        }

        setText("asset-count", `${installerCount} ${installerCount === 1 ? "instalador" : "instaladores"}`);
    } catch (error) {
        console.error(error);
        setText("version", "—");
        setText("publish-date", "—");
        setText("asset-count", "—");
    }
}

highlightPlatform();
setupReveal();
setupVideos();
setupAppPreview();
setupConsole();
setupReleaseDemo();
setupTransfers();
setupJavaDemo();
setupStepsRail();
loadReleaseInfo();
