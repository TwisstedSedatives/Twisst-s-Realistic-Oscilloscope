# Twisst's Oscilloscope

A high-fidelity, web-based oscilloscope simulation featuring realistic analog behavior, phosphor persistence, and XY mode support.

## Features

-   **Analog Emulation:** Realistic phosphor decay, beam intensity modulation, and electron bloom.
-   **Dual Channel / XY Mode:** Supports standard time-domain plotting and Lissajous (XY) figures.
-   **Signal Sources:**
    -   Built-in Sine Wave Generator
    -   Microphone Input
    -   Audio File Upload
-   **Advanced Rendering:**
    -   WebGL-accelerated rendering pipeline.
    -   Velocity-based intensity (fast sweeps are dimmer, slow dots are bright).
    -   Multi-pass glow effects (Halo, Body, Core).
    -   Catmull-Rom spline interpolation for smooth curves.
-   **Controls:**
    -   Vertical/Horizontal scaling and positioning.
    -   Trigger controls (Level, Mode).
    -   Phosphor color selection (Green P31, Amber P134, Blue P11, etc.).
    -   Adjustable persistence, intensity, focus, and grid brightness.

## How to Run

1.  **Windows:** Double-click `run_app.bat`. This will start a local Python server and open the oscilloscope in your default browser.
2.  **Manual:** Serve the directory using any HTTP server (e.g., `python -m http.server`, `npx http-server`, etc.) and navigate to `localhost:8000`.

## Tech Stack

-   **Frontend:** HTML5, CSS3, JavaScript (ES6+).
-   **Graphics:** WebGL (with fallback support).
-   **Audio:** Web Audio API.

## Credits

Developed as a realistic oscilloscope simulation project.
