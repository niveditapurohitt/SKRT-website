document.addEventListener("DOMContentLoaded", () => {

    const roadSvg = document.getElementById("road-svg");
    const roadPath = document.getElementById("road-path");
    const poster = document.querySelector(".poster");
    const form = document.getElementById("logistics-form");
    const sections = [...document.querySelectorAll(".poster-section")];
    const dock = document.querySelector(".dock");
    const dockMenuToggle = document.querySelector(".dock-menu-toggle");
    const navLinks = [...document.querySelectorAll(".dock-link[data-target]")];
    const vehicleImages = [...document.querySelectorAll(".vehicle-body")];

    if (!roadSvg || !roadPath) {
        return;
    }

    const roadLength = roadPath.getTotalLength();

    const VIEWBOX_WIDTH = 420;
    const VIEWBOX_HEIGHT = 1700;

    const LANE_OFFSET = -22;
    const TURN_CENTERING = 0.55;
    const ROAD_EDGE_MARGIN = 4;
    const QUEUE_GAP = 118;

    const SECTION_ANCHOR_SCREEN_FRACTION = 0.5;

    const UPRIGHT_ROTATION = 0;
    const CURVE_TILT_MULTIPLIER = 1.7;
    const MAX_CURVE_TILT = 30;

    const trucks = [
        {
            element: document.getElementById("truck-one"),
            turnAmount: 0,
            parkedSectionId: "home",
            parked: {
                x: 208,
                y: 1508,
                rotation: UPRIGHT_ROTATION
            },
            direction: 1,
            lastRotation: 0,
            pathStart: 0.11,
            pathEnd: 1,
            progressStart: 0,
            progressEnd: 1,
            stopSectionId: "contact",
            headlightsOnWhenParked: true
        }
    ];

    let targetProgress = 0;
    let currentProgress = 0;
    let previousProgress = 0;

    // Used so parking/stopping anchors can align to the same lane direction
    // as the currently perceived travel direction.
    let isReversing = false;

    let needsRender = true;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function lerp(start, end, amount) {
        return start + (end - start) * amount;
    }

    function lerpAngle(start, end, amount) {

        let diff = end - start;

        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;

        return start + diff * amount;
    }

    function pathPointAt(progressOnPath) {

        return roadPath.getPointAtLength(
            roadLength * clamp(progressOnPath, 0, 1)
        );
    }

    function pathRotationAt(progressOnPath) {

        const lengthAtPoint =
            roadLength * clamp(progressOnPath, 0, 1);

        const pointA =
            roadPath.getPointAtLength(
                Math.max(0, lengthAtPoint - 3)
            );

        const pointB =
            roadPath.getPointAtLength(
                Math.min(roadLength, lengthAtPoint + 3)
            );

        return (
            Math.atan2(
                pointB.y - pointA.y,
                pointB.x - pointA.x
            ) *
            180 /
            Math.PI +
            90
        );
    }

    function cssNumber(name, fallback) {

        const value =
            getComputedStyle(document.documentElement)
                .getPropertyValue(name)
                .trim();

        const numericValue =
            Number.parseFloat(value);

        return Number.isFinite(numericValue)
            ? numericValue
            : fallback;
    }

    function viewBoxScaleX() {

        const rect =
            roadSvg.getBoundingClientRect();

        return (rect.width || VIEWBOX_WIDTH) / VIEWBOX_WIDTH;
    }

    function safeLaneOffset(truck, desiredOffset) {

        const scaleX =
            viewBoxScaleX() || 1;

        const elementWidth =
            truck?.element?.offsetWidth ||
            truck?.element?.getBoundingClientRect().width ||
            86;

        const roadHalfWidth =
            cssNumber("--road-width", 88) / 2;

        const vehicleHalfWidth =
            (elementWidth / scaleX) / 2;

        const maxOffset =
            Math.max(
                0,
                roadHalfWidth -
                vehicleHalfWidth -
                ROAD_EDGE_MARGIN
            );

        return Math.sign(desiredOffset || 1) *
            Math.min(Math.abs(desiredOffset), maxOffset);
    }

    function roadAlignedRotation(progressOnPath) {
        const curveRotation =
            pathRotationAt(progressOnPath) *
            CURVE_TILT_MULTIPLIER;

        return clamp(
            curveRotation,
            -MAX_CURVE_TILT,
            MAX_CURVE_TILT
        );
    }

    function closestPathProgressToPoint(targetX, targetY) {

        let bestProgress = 0;
        let bestDistance = Infinity;

        const samples = 240;

        for (let index = 0; index <= samples; index += 1) {

            const progress = index / samples;

            const point = pathPointAt(progress);

            const distance =
                ((point.x - targetX) ** 2) +
                ((point.y - targetY) ** 2);

            if (distance < bestDistance) {

                bestDistance = distance;
                bestProgress = progress;
            }
        }

        return bestProgress;
    }

    function pointAlongVehicleAxis(x, y, rotation, distance) {

        const angle = rotation * Math.PI / 180;

        return {
            x: x + Math.sin(angle) * distance,
            y: y - Math.cos(angle) * distance
        };
    }

    function offsetPoint(x, y, rotation, distance) {

        const angle = (rotation - 90) * Math.PI / 180;

        const normalX = -Math.sin(angle);
        const normalY = Math.cos(angle);

        return {
            x: x + normalX * distance,
            y: y + normalY * distance
        };
    }

    function viewBoxYFromDocumentY(documentY) {

        const posterHeight =
            poster?.scrollHeight || 1;

        return clamp(
            (documentY / posterHeight) *
            VIEWBOX_HEIGHT,
            0,
            VIEWBOX_HEIGHT
        );
    }

    function sectionAnchorState(sectionId, fallbackProgress, truck) {

        const section =
            sectionId
                ? document.getElementById(sectionId)
                : null;

        if (!section) {

            const fallbackPoint =
                pathPointAt(fallbackProgress);

            const fallbackRotation =
                roadAlignedRotation(fallbackProgress);

            return {
                x: fallbackPoint.x,
                y: fallbackPoint.y,
                rotation: fallbackRotation,
                pathProgress: fallbackProgress
            };
        }

        const documentAnchorY =
            section.offsetTop +
            (window.innerHeight *
                SECTION_ANCHOR_SCREEN_FRACTION);

        const anchorY =
            viewBoxYFromDocumentY(documentAnchorY);

        const pathProgress =
            closestPathProgressToPoint(
                VIEWBOX_WIDTH / 2,
                anchorY
            );

        const point =
            pathPointAt(pathProgress);

        const tangentRotation =
            pathRotationAt(
                Math.min(pathProgress + 0.015, 1)
            );

        const rotation =
            roadAlignedRotation(pathProgress);

        const laneAnchorOffset =
            safeLaneOffset(
                truck,
                isReversing ? Math.abs(LANE_OFFSET) : LANE_OFFSET
            );

        const offset =
            offsetPoint(
                point.x,
                point.y,
                tangentRotation,
                laneAnchorOffset
            );

        return {
            x: offset.x,
            y: offset.y,
            rotation,
            pathProgress
        };
    }

    function syncTruckAnchors() {

        const fallbackProgresses = [
            0.24,
            0.5,
            0.76
        ];

        trucks.forEach((truck, index) => {

            if (!truck.parkedSectionId) return;

            truck.parked =
                sectionAnchorState(
                    truck.parkedSectionId,
                    fallbackProgresses[index],
                    truck
                );

            truck.lastRotation = truck.parked.rotation;
        });

        trucks.forEach((truck, index) => {

            if (!truck.stopSectionId) return;

            const stopState =
                sectionAnchorState(
                    truck.stopSectionId,
                    fallbackProgresses[index] + 0.12,
                    truck
                );

            truck.stop = {
                x: stopState.x,
                y: stopState.y,
                rotation: stopState.rotation
            };

            truck.stopPathProgress =
                stopState.pathProgress;
        });

        trucks.forEach((truck) => {

            if (
                typeof truck.queueBehindIndex !== "number"
            ) {
                return;
            }

            const nextTruck =
                trucks[truck.queueBehindIndex];

            if (!nextTruck?.parked) return;

            const queuedPoint =
                pointAlongVehicleAxis(
                    nextTruck.parked.x,
                    nextTruck.parked.y,
                    nextTruck.parked.rotation,
                    -QUEUE_GAP
                );

            truck.stop = {
                x: queuedPoint.x,
                y: queuedPoint.y,
                rotation: nextTruck.parked.rotation
            };

            truck.stopPathProgress =
                closestPathProgressToPoint(
                    queuedPoint.x,
                    queuedPoint.y
                );
        });
    }

    function routeProgressFromScroll() {

        const maxScroll =
            document.documentElement.scrollHeight -
            window.innerHeight;

        if (maxScroll <= 0) {
            return 0;
        }

        return clamp(
            1 - window.scrollY / maxScroll,
            0,
            1
        );
    }

    function updateTargetProgress() {

        targetProgress =
            routeProgressFromScroll();

        needsRender = true;
    }

    function setDockMenuOpen(isOpen) {

        if (!dock || !dockMenuToggle) return;

        dock.classList.toggle("menu-open", isOpen);

        dockMenuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        dockMenuToggle.setAttribute(
            "aria-label",
            isOpen
                ? "Close navigation menu"
                : "Open navigation menu"
        );
    }

    function truckState(truck, progress) {

        const stopPathProgress =
            truck.stopPathProgress ??
            truck.pathEnd;

        const clampedStopPathProgress =
            clamp(
                stopPathProgress,
                truck.pathStart,
                truck.pathEnd
            );

        const isTruckMoving =
            Math.abs(targetProgress - currentProgress) > 0.002;

        // PARKED STATE
        if (progress <= truck.progressStart) {

            return {
                x: truck.parked.x,
                y: truck.parked.y,
                rotation: truck.lastRotation,
                headlightsOn: false,
                tailLightsOn: true
            };
        }

        // STOPPED STATE
        if (progress >= truck.progressEnd) {

            return {
                x: truck.stop.x,
                y: truck.stop.y,
                rotation: truck.lastRotation,
                headlightsOn: false,
                tailLightsOn: true
            };
        }

        // SECTION PROGRESS
        const localProgress = clamp(
            (progress - truck.progressStart) /
            (truck.progressEnd - truck.progressStart),
            0,
            1
        );

        const pathProgress = lerp(
            truck.pathStart,
            clampedStopPathProgress,
            localProgress
        );

        const point =
            pathPointAt(pathProgress);

        const tangentRotation =
            pathRotationAt(pathProgress);

        let rotation =
            roadAlignedRotation(pathProgress);

        const movingBackward =
            currentProgress < previousProgress;

        const targetTurn =
            movingBackward
                ? 1
                : 0;

        truck.turnAmount = lerp(
            truck.turnAmount,
            targetTurn,
            0.03
        );

        const targetRotation =
            rotation +
            (180 * truck.turnAmount);

        if (truck.lastRotation === undefined) {
            truck.lastRotation = targetRotation;
        }

        truck.lastRotation =
            lerpAngle(
                truck.lastRotation,
                targetRotation,
                0.04
            );

        rotation = truck.lastRotation;



        const laneOffset = lerp(
            LANE_OFFSET,
            Math.abs(LANE_OFFSET),
            truck.turnAmount
        );

        const centeredLaneOffset =
            safeLaneOffset(
                truck,
                laneOffset *
                (1 - (Math.sin(truck.turnAmount * Math.PI) * TURN_CENTERING))
            );

        let offset =
            offsetPoint(
                point.x,
                point.y,
                tangentRotation,
                centeredLaneOffset
            );

        const isTruckStopped =
            Math.abs(progress - truck.progressStart) < 0.015 ||
            Math.abs(progress - truck.progressEnd) < 0.015;

        return {
            x: offset.x,
            y: offset.y,
            rotation,
            headlightsOn: isTruckMoving,
            tailLightsOn: !isTruckMoving
        };
    }

    function renderTrucks(progress) {

        const rect =
            roadSvg.getBoundingClientRect();

        const renderWidth =
            rect.width || VIEWBOX_WIDTH;

        const renderHeight =
            rect.height || VIEWBOX_HEIGHT;

        const scaleX =
            renderWidth / VIEWBOX_WIDTH;

        const scaleY =
            renderHeight / VIEWBOX_HEIGHT;

        trucks.forEach((truck) => {

            if (!truck.element) return;

            const state =
                truckState(truck, progress);

            const halfWidth =
                (truck.element.offsetWidth || 86) / 2;

            const halfHeight =
                (truck.element.offsetHeight || 132) / 2;

            truck.element.style.transform =
                `translate3d(
                    ${state.x * scaleX - halfWidth}px,
                    ${state.y * scaleY - halfHeight}px,
                    0
                ) rotate(${state.rotation}deg)`;

            truck.element.classList.toggle(
                "headlights-on",
                state.headlightsOn
            );

            truck.element.classList.toggle(
                "tail-lights-on",
                state.tailLightsOn
            );

            truck.element.classList.add("is-rendered");
        });
    }

    function animationLoop() {

        const difference =
            targetProgress - currentProgress;

        if (
            Math.abs(difference) > 0.0005 ||
            needsRender
        ) {

            previousProgress = currentProgress;

            isReversing = targetProgress < previousProgress;

            currentProgress =
                lerp(
                    currentProgress,
                    targetProgress,
                    0.08
                );

            renderTrucks(currentProgress);

            needsRender = false;
        }

        requestAnimationFrame(animationLoop);
    }

    navLinks.forEach((link) => {

        link.addEventListener("click", (event) => {

            const targetId =
                link.dataset.target;

            const target =
                targetId
                    ? document.getElementById(targetId)
                    : null;

            if (!target) return;

            event.preventDefault();

            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
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

    vehicleImages.forEach((image) => {

        image.addEventListener("load", () => {

            needsRender = true;

            renderTrucks(currentProgress);
        });
    });

    window.addEventListener("scroll", () => {

        updateTargetProgress();

    }, { passive: true });

    window.addEventListener("resize", () => {

        syncTruckAnchors();

        needsRender = true;

        updateTargetProgress();

    });

    window.addEventListener("load", () => {

        const maxScroll =
            document.documentElement.scrollHeight -
            window.innerHeight;

        if (window.scrollY === 0 && maxScroll > 0) {
            window.scrollTo(0, maxScroll);
        }

        syncTruckAnchors();

        updateTargetProgress();

        currentProgress = targetProgress;

        renderTrucks(currentProgress);
    });

    syncTruckAnchors();

    updateTargetProgress();

    currentProgress = targetProgress;

    renderTrucks(currentProgress);

    requestAnimationFrame(animationLoop);

});

