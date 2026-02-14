/* ========================================
   INTERACTIVE HEARTS CANVAS
   Hearts scatter away from the mouse cursor,
   then drift back to their home positions.
   ======================================== */

(function () {
    const canvas = document.getElementById("hearts-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    /* --- Config (tweak these!) --- */
    const HEART_COUNT = 500;         // How many hearts to scatter
    const MOUSE_RADIUS = 250;        // How far the repulsion reaches (px)
    const REPULSION_STRENGTH = 12;   // How hard hearts push away
    const RETURN_SPEED = 0.00001;       // How fast hearts drift home (0-1, lower = slower)
    const FRICTION = 0.80;           // Velocity damping each frame

    /* --- Heart palette: various pinks and reds --- */
    const COLORS = [
        "#FF6B8A",  // pink-main
        "#E84575",  // pink-dark
        "#FF9BB5",  // soft pink
        "#D63864",  // deep rose
        "#FF4D6D",  // hot pink
        "#C9184A",  // crimson
        "#FFB3C6",  // blush
        "#FF758F",  // coral pink
        "#A4133C",  // dark red
        "#FF85A1",  // light rose
    ];

    const HEART_CHARS = ["♥", "♡", "❤", "💕", "💗", "💖", "❣"];

    /* --- State --- */
    let hearts = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let animationId;

    /* --- Draw a heart character (from HEART_CHARS) --- */
    function drawHeart(x, y, size, color, opacity, char, rotation) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.font = size + "px \"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillText(char, 0, 0);
        ctx.restore();
    }

    /* --- Initialize hearts at random positions --- */
    function createHearts() {
        hearts = [];
        for (var i = 0; i < HEART_COUNT; i++) {
            var homeX = Math.random() * canvas.width;
            var homeY = Math.random() * canvas.height;
            hearts.push({
                homeX: homeX,
                homeY: homeY,
                x: homeX,
                y: homeY,
                vx: 0,
                vy: 0,
                size: 36 + Math.random() * 48,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                opacity: 1,
                rotation: Math.random() * Math.PI * 2,
                char: HEART_CHARS[Math.floor(Math.random() * HEART_CHARS.length)],
            });
        }
    }

    /* --- Resize canvas to fill the landing page --- */
    function resize() {
        var landing = document.getElementById("landing-page");
        canvas.width = landing.offsetWidth || window.innerWidth;
        canvas.height = landing.offsetHeight || window.innerHeight;
        // Recreate hearts if we haven't yet, or redistribute homes
        if (hearts.length === 0) {
            createHearts();
        } else {
            // Redistribute home positions on resize
            for (var i = 0; i < hearts.length; i++) {
                hearts[i].homeX = Math.random() * canvas.width;
                hearts[i].homeY = Math.random() * canvas.height;
            }
        }
    }

    /* --- Animation loop --- */
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = 0; i < hearts.length; i++) {
            var h = hearts[i];

            // Distance from mouse
            var dx = h.x - mouseX;
            var dy = h.y - mouseY;
            var dist = Math.sqrt(dx * dx + dy * dy);

            // Repulsion from mouse (smaller hearts get pushed more, like real physics)
            if (dist < MOUSE_RADIUS && dist > 0) {
                var force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
                force = force * force * REPULSION_STRENGTH;
                var sizeFactor = 60 / h.size;  // smaller heart → larger factor
                h.vx += (dx / dist) * force * sizeFactor;
                h.vy += (dy / dist) * force * sizeFactor;
            }

            // Spring back toward home position
            h.vx += (h.homeX - h.x) * RETURN_SPEED;
            h.vy += (h.homeY - h.y) * RETURN_SPEED;

            // Apply friction
            h.vx *= FRICTION;
            h.vy *= FRICTION;

            // Update position
            h.x += h.vx;
            h.y += h.vy;

            // Draw
            drawHeart(h.x, h.y, h.size, h.color, h.opacity, h.char, h.rotation);
        }

        animationId = requestAnimationFrame(animate);
    }

    /* --- Mouse tracking (on landing page, since canvas has pointer-events: none) --- */
    var landing = document.getElementById("landing-page");
    function setMouseFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    }
    landing.addEventListener("mousemove", setMouseFromEvent);
    landing.addEventListener("mouseleave", function () {
        mouseX = -9999;
        mouseY = -9999;
    });

    // Also track touch for mobile
    landing.addEventListener("touchmove", function (e) {
        var rect = canvas.getBoundingClientRect();
        var touch = e.touches[0];
        mouseX = touch.clientX - rect.left;
        mouseY = touch.clientY - rect.top;
    }, { passive: true });
    landing.addEventListener("touchend", function () {
        mouseX = -9999;
        mouseY = -9999;
    });

    /* --- Start --- */
    window.addEventListener("resize", resize);
    resize();
    animate();

    /* --- Expose stop function so app.js can pause it when leaving landing page --- */
    window.stopHeartsAnimation = function () {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    };

    window.startHeartsAnimation = function () {
        if (!animationId) {
            animate();
        }
    };
})();
