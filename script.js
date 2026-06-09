document.addEventListener("DOMContentLoaded", () => {
    const posterTrack = document.querySelector(".poster-track");
    const posterShell = document.querySelector(".poster-shell");
    const form = document.getElementById("logistics-form");
    const trackingForm = document.getElementById("tracking-form");
    const trackingMap = document.querySelector("[data-tracking-map]");
    const trackingTitle = document.querySelector("[data-tracking-title]");
    const trackingCopy = document.querySelector("[data-tracking-copy]");
    const trackingBadge = document.querySelector("[data-tracking-badge]");
    const trackingStatus = document.querySelector("[data-tracking-status]");
    const trackingGr = document.querySelector("[data-tracking-gr]");
    const trackingVehicle = document.querySelector("[data-tracking-vehicle]");
    const trackingChallan = document.querySelector("[data-tracking-challan]");
    const sections = [...document.querySelectorAll(".poster-section")];
    const truckLayer = document.querySelector(".home-truck-layer");
    const serviceCards = [...document.querySelectorAll("[data-service-card]")];
    const serviceModal = document.getElementById("service-modal");
    let activeServiceCard = null;

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
    let lastScrollY = window.scrollY;
    let scrollDirection = "forward";

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

    function mixRgba(startHex, endHex, amount, alpha) {
        const start = hexToRgb(startHex);
        const end = hexToRgb(endHex);

        return `rgba(${clampByte(lerp(start.r, end.r, amount))}, ${clampByte(lerp(start.g, end.g, amount))}, ${clampByte(lerp(start.b, end.b, amount))}, ${alpha.toFixed(3)})`;
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

    function setTrackingStatus(message, isError = false) {
        if (!trackingStatus) return;

        trackingStatus.textContent = message;
        trackingStatus.classList.toggle("is-error", isError);
    }

    function getTrackingValue(formData, fieldName) {
        return String(formData.get(fieldName) || "").trim();
    }

    function updateTrackingCard(values) {
        if (!trackingMap || !trackingTitle || !trackingCopy || !trackingBadge) return;

        const { grNumber, vehicleNumber, challanNumber } = values;
        const summaryParts = [];

        if (trackingGr) {
            trackingGr.textContent = grNumber || "--";
        }

        if (trackingVehicle) {
            trackingVehicle.textContent = vehicleNumber || "--";
        }

        if (trackingChallan) {
            trackingChallan.textContent = challanNumber || "--";
        }

        if (grNumber) {
            summaryParts.push(`GR ${grNumber}`);
        }

        if (vehicleNumber) {
            summaryParts.push(`Vehicle ${vehicleNumber}`);
        }

        if (challanNumber) {
            summaryParts.push(`Challan ${challanNumber}`);
        }

        const primaryLabel = grNumber || vehicleNumber || challanNumber;

        trackingMap.classList.remove("tracking-map-empty");
        trackingMap.classList.add("tracking-map-ready");
        trackingBadge.textContent = "Live";
        trackingTitle.textContent = primaryLabel
            ? `${summaryParts[0]} tracking map`
            : "Tracking map ready";
        trackingCopy.textContent = summaryParts.length
            ? `Search accepted for ${summaryParts.join(" · ")}. The route card is now active.`
            : "Enter any one identifier on the right to load the route map, shipment status, and stop details here.";
    }

    function closeServiceModal() {
        if (!serviceModal) return;

        serviceModal.classList.remove("is-open");
        serviceModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("service-modal-open");

        if (activeServiceCard instanceof HTMLElement) {
            activeServiceCard.focus();
        }
    }

    function openServiceModal(card) {
        if (!serviceModal) {
            return;
        }

        activeServiceCard = card;
        serviceModal.classList.add("is-open");
        serviceModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("service-modal-open");

        const closeButton = serviceModal.querySelector("[data-service-close]");
        if (closeButton instanceof HTMLElement) {
            closeButton.focus();
        }
    }

    function updateBackground(progress) {
        const sunrise = clamp(1 - progress, 0, 1);
        const glow = Math.pow(sunrise, 1.15);

        root.style.setProperty("--bg-pan-x", `${(sunrise * 100).toFixed(2)}%`);
        root.style.setProperty("--bg-overlay-start", mixRgba("#030712", "#23131e", glow * 0.7, 0.8 - glow * 0.2));
        root.style.setProperty("--bg-overlay-center", mixRgba("#121221", "#894e73", glow * 0.9, 0.42 - glow * 0.12));
        root.style.setProperty("--bg-overlay-end", mixRgba("#1d2739", "#ffe0a7", glow, 0.12 + glow * 0.18));
    }

    function updateTruckLights() {
        if (!truckLayer) return;

        const isMoving = Math.abs(targetProgress - currentProgress) > 0.0025;

        truckLayer.classList.toggle("truck-moving", isMoving);
        truckLayer.classList.toggle("truck-stopped", !isMoving);
    }

    function updateTruckDirection() {
        if (!truckLayer) return;

        truckLayer.classList.toggle("truck-direction-forward", scrollDirection !== "reverse");
        truckLayer.classList.toggle("truck-direction-reverse", scrollDirection === "reverse");
    }

    function renderScene(progress) {
        const trackX = -(1 - progress) * horizontalDistance;
        const wheelTravel = (1 - progress) * horizontalDistance;
        posterTrack.style.transform = `translate3d(${trackX}px, 0, 0)`;
        root.style.setProperty("--truck-wheel-spin", `${wheelTravel * 2.2}deg`);
        updateBackground(progress);
        updateTruckDirection();
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

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
        });
    }

    if (trackingForm) {
        trackingForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const formData = new FormData(trackingForm);
            const grNumber = getTrackingValue(formData, "grNumber");
            const vehicleNumber = getTrackingValue(formData, "vehicleNumber");
            const challanNumber = getTrackingValue(formData, "challanNumber");

            if (!grNumber && !vehicleNumber && !challanNumber) {
                setTrackingStatus("Enter at least one of GR number, vehicle number, or challan number.", true);

                if (trackingMap && trackingTitle && trackingCopy && trackingBadge) {
                    trackingMap.classList.remove("tracking-map-ready");
                    trackingMap.classList.add("tracking-map-empty");
                    trackingBadge.textContent = "Idle";
                    trackingTitle.textContent = "Awaiting shipment details";
                    trackingCopy.textContent = "Enter any one identifier on the right to load the route map, shipment status, and stop details here.";
                }

                return;
            }

            updateTrackingCard({
                grNumber,
                vehicleNumber,
                challanNumber
            });

            setTrackingStatus("Tracking map loaded successfully.");
        });

        trackingForm.addEventListener("input", () => {
            if (trackingStatus?.classList.contains("is-error")) {
                setTrackingStatus("");
            }
        });
    }

    if (serviceCards.length > 0 && serviceModal) {
        serviceCards.forEach((card) => {
            card.addEventListener("click", () => {
                openServiceModal(card);
            });
        });

        serviceModal.addEventListener("click", (event) => {
            const target = event.target;

            if (target instanceof Element && target.closest("[data-service-close]")) {
                closeServiceModal();
            }
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && serviceModal?.classList.contains("is-open")) {
            closeServiceModal();
        }
    });

    window.addEventListener(
        "scroll",
        () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY > lastScrollY) {
                scrollDirection = "forward";
            } else if (currentScrollY < lastScrollY) {
                scrollDirection = "reverse";
            }

            lastScrollY = currentScrollY;
            updateTruckDirection();
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
        updateTruckDirection();

        currentProgress = targetProgress;
        renderScene(currentProgress);
    });

    updateMetrics();
    updateTargetProgress();
    updateTruckDirection();
    currentProgress = targetProgress;
    renderScene(currentProgress);
    requestAnimationFrame(animationLoop);
});
