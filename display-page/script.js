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
    document.querySelectorAll(".feature-grid, .platform-grid").forEach(group => {
        [...group.children].forEach((child, i) => {
            child.style.setProperty("--stagger", `${i * 70}ms`);
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

/* ── Inclinación sutil de la captura del hero ────────────────── */

function setupTilt() {
    const visual = document.querySelector(".hero-visual");
    const frame = visual?.querySelector(".window");
    if (!frame || prefersReducedMotion || !window.matchMedia("(pointer: fine)").matches) return;

    visual.addEventListener("pointermove", e => {
        const rect = visual.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        frame.style.setProperty("--ry", `${(x * 8 - 3).toFixed(2)}deg`);
        frame.style.setProperty("--rx", `${(-y * 6 + 1).toFixed(2)}deg`);
    });

    visual.addEventListener("pointerleave", () => {
        frame.style.removeProperty("--ry");
        frame.style.removeProperty("--rx");
    });
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
setupTilt();
loadReleaseInfo();
