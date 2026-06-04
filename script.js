document.addEventListener("DOMContentLoaded", () => {
    const posterTrack = document.querySelector(".poster-track");
    const posterShell = document.querySelector(".poster-shell");
    const form = document.getElementById("logistics-form");
    const sections = [...document.querySelectorAll(".poster-section")];
    const dock = document.querySelector(".dock");
    const dockMenuToggle = document.querySelector(".dock-menu-toggle");
    const navLinks = [...document.querySelectorAll(".dock-link[data-target]")];
    const truckLayer = document.querySelector(".home-truck-layer");

    if (!posterTrack || !posterShell || sections.length === 0) {
        return;
    }

    const root = document.documentElement;

    if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
    }

    let horizontalDistance = 0;
    let targetProgress = 0;
    let currentProgress = 0;
    let maxScroll = 0;
    let needsRender = true;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function lerp(start, end, amount) {
        return start + (end - start) * amount;
    }

    function clampByte(value) {
        return Math.min(255, Math.max(0, Math.round(value)));
    }

    function hexToRgb(hex) {
        const normalized = hex.replace("#", "");

        return {
            r: Number.parseInt(normalized.slice(0, 2), 16),
            g: Number.parseInt(normalized.slice(2, 4), 16),
            b: Number.parseInt(normalized.slice(4, 6), 16)
        };
    }

    function mixColor(startHex, endHex, amount) {
        const start = hexToRgb(startHex);
        const end = hexToRgb(endHex);

        return `rgb(${clampByte(lerp(start.r, end.r, amount))}, ${clampByte(lerp(start.g, end.g, amount))}, ${clampByte(lerp(start.b, end.b, amount))})`;
    }

    function sectionIndex(sectionId) {
        return sections.findIndex((section) => section.id === sectionId);
    }

    function setDockMenuOpen(isOpen) {
        if (!dock || !dockMenuToggle) return;

        dock.classList.toggle("menu-open", isOpen);
        dockMenuToggle.setAttribute("aria-expanded", String(isOpen));
        dockMenuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close navigation menu" : "Open navigation menu"
        );
    }

    function updateMetrics() {
        horizontalDistance = Math.max(
            0,
            (sections.length - 1) * window.innerWidth
        );

        root.style.setProperty("--horizontal-distance", `${horizontalDistance}px`);

        maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
        );
    }

    function routeProgressFromScroll() {
        if (maxScroll <= 0) {
            return 1;
        }

        return clamp(1 - window.scrollY / maxScroll, 0, 1);
    }

    function updateTargetProgress() {
        targetProgress = routeProgressFromScroll();
        needsRender = true;
    }

    function updateBackground(progress) {
        const sunrise = clamp(1 - progress, 0, 1);
        const glow = Math.pow(sunrise, 1.15);

        root.style.setProperty("--bg-start", mixColor("#050505", "#2a120c", glow * 0.72));
        root.style.setProperty("--bg-center", mixColor("#120c0a", "#a35f2a", glow * 0.88));
        root.style.setProperty("--bg-end", mixColor("#2d1f16", "#ffd38a", glow));
    }

    function updateActiveLink(progress) {
        if (!navLinks.length) return;

        const activeIndex = clamp(
            Math.round((1 - progress) * (sections.length - 1)),
            0,
            sections.length - 1
        );

        navLinks.forEach((link) => {
            const linkIndex = sectionIndex(link.dataset.target || "");
            link.classList.toggle("active", linkIndex === activeIndex);
        });
    }

    function updateTruckLights() {
        if (!truckLayer) return;

        const isMoving = Math.abs(targetProgress - currentProgress) > 0.0025;

        truckLayer.classList.toggle("truck-moving", isMoving);
        truckLayer.classList.toggle("truck-stopped", !isMoving);
    }

    function renderScene(progress) {
        const trackX = -(1 - progress) * horizontalDistance;
        const wheelTravel = (1 - progress) * horizontalDistance;
        posterTrack.style.transform = `translate3d(${trackX}px, 0, 0)`;
        root.style.setProperty("--truck-wheel-spin", `${wheelTravel * 2.2}deg`);
        updateBackground(progress);
        updateActiveLink(progress);
        updateTruckLights();
    }

    function animationLoop() {
        const difference = targetProgress - currentProgress;

        if (Math.abs(difference) > 0.0005 || needsRender) {
            currentProgress = lerp(currentProgress, targetProgress, 0.08);
            renderScene(currentProgress);
            needsRender = false;
        }

        requestAnimationFrame(animationLoop);
    }

    navLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            const targetId = link.dataset.target;
            const targetIndex = sectionIndex(targetId || "");

            if (targetIndex < 0) return;

            event.preventDefault();

            const fraction =
                sections.length <= 1
                    ? 0
                    : targetIndex / (sections.length - 1);

            const targetScroll = Math.round(maxScroll * fraction);

            window.scrollTo({
                top: targetScroll,
                behavior: "smooth"
            });

            setDockMenuOpen(false);
        });
    });

    if (dockMenuToggle) {
        dockMenuToggle.addEventListener("click", () => {
            setDockMenuOpen(!dock?.classList.contains("menu-open"));
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setDockMenuOpen(false);
        }
    });

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
        });
    }

    window.addEventListener(
        "scroll",
        () => {
            updateTargetProgress();
        },
        { passive: true }
    );

    window.addEventListener("resize", () => {
        updateMetrics();
        updateTargetProgress();
    });

    window.addEventListener("load", () => {
        window.scrollTo(0, 0);

        updateMetrics();
        updateTargetProgress();

        currentProgress = targetProgress;
        renderScene(currentProgress);
    });

    updateMetrics();
    updateTargetProgress();
    currentProgress = targetProgress;
    renderScene(currentProgress);
    requestAnimationFrame(animationLoop);
});
