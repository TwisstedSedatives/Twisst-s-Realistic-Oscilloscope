let canvas = document.getElementById('scopeCanvas');
const infoText = document.getElementById('infoText');

// Controls Elements
const vScaleInput = document.getElementById('vScale');
const vPosInput = document.getElementById('vPos');
const hScaleInput = document.getElementById('hScale');
const trigLevelInput = document.getElementById('trigLevel');
const trigModeInput = document.getElementById('trigMode');
const displayModeSelect = document.getElementById('displayMode');
const signalTypeInput = document.getElementById('signalType');
const audioDeviceSelect = document.getElementById('audioDevice');
const fileControl = document.getElementById('fileControl');
const audioFileInput = document.getElementById('audioFileInput');
const audioPlayer = document.getElementById('audioPlayer');
const colorModeSelect = document.getElementById('colorMode');
const intensityInput = document.getElementById('intensity');
const focusInput = document.getElementById('focus');
const gridIntensityInput = document.getElementById('gridIntensity');
const persistInput = document.getElementById('persist');
const velSensInput = document.getElementById('velSens');
const micSensitivityInput = document.getElementById('micSensitivity');
const sigFreqInput = document.getElementById('sigFreq');
const powerBtn = document.getElementById('powerBtn');
const micSensitivityControl = document.getElementById('micSensitivityControl');
const couplingModeSelect = document.getElementById('couplingMode');

// State
let isRunning = false;
let isToggling = false; // Flag to prevent rapid-fire clicking
let audioCtx;
let analyserL, analyserR;
let splitter;
let sourceNode;
let fileSourceNode;
let gainNode;
let oscillator;
let dataArrayL, dataArrayR;
let bufferLength;
let animationId;
let micStream;
let lastInfoString = '';

// Parameters
let displayMode = displayModeSelect.value;
let vScale = parseFloat(vScaleInput.value);
let vPos = parseFloat(vPosInput.value);
let hScale = parseFloat(hScaleInput.value);
let trigLevel = parseFloat(trigLevelInput.value);
let trigMode = trigModeInput.value;
let signalType = signalTypeInput.value;
let sigFreq = parseFloat(sigFreqInput.value);
let colorMode = colorModeSelect.value;
let intensity = parseFloat(intensityInput.value);
let focus = parseFloat(focusInput.value);
let gridIntensity = parseFloat(gridIntensityInput.value);
let persist = parseFloat(persistInput.value);
let velSens = parseFloat(velSensInput.value);
let micSensitivity = parseFloat(micSensitivityInput.value);
let couplingMode = 'ac'; // Default AC coupling for audio

// Cached Styles
let currentGridColor = '';
let currentPrimaryColor = '';
let currentShadowColor = '';
let fadeColor = `rgba(0, 0, 0, 0.2)`;
let dcOffset = 0; // Simulated DC offset for "DC" coupling mode

// Color Definitions
const COLORS = {
    green: { primary: '#0f0', shadow: '#0f0', grid: 'rgba(50, 100, 50, 0.3)' },
    amber: { primary: '#ffb000', shadow: '#ffb000', grid: 'rgba(100, 70, 0, 0.3)' },
    blue: { primary: '#00f0ff', shadow: '#00f0ff', grid: 'rgba(0, 70, 100, 0.3)' },
    white: { primary: '#e0e0e0', shadow: '#ffffff', grid: 'rgba(80, 80, 80, 0.3)' },
    red: { primary: '#ff0033', shadow: '#ff0033', grid: 'rgba(100, 20, 20, 0.3)' },
    purple: { primary: '#bf00ff', shadow: '#bf00ff', grid: 'rgba(80, 0, 100, 0.3)' },
    cyan: { primary: '#00ffff', shadow: '#00ffff', grid: 'rgba(0, 100, 100, 0.3)' },
    yellow: { primary: '#ffff00', shadow: '#ffff00', grid: 'rgba(100, 100, 20, 0.3)' }
};

const GRID_DIVISIONS_X = 10;
const GRID_DIVISIONS_Y = 8;

// --- WebGL Renderer (Main Thread) ---

let gl;
let program;
let bufferL, bufferR, bufferVelocity, bufferIndex;
let uResolution, uScale, uOffset, uColor, uIntensity, uMode, uTotalSamples, uShift, uVelocitySens;
let attribs = {};
let vao = null;
let indexArray;
let velocityArray;

// State variables
let colorR = 0, colorG = 1, colorB = 0;

function initWebGL() {
    // Try WebGL 2 first
    gl = canvas.getContext('webgl2', { 
        alpha: false,
        depth: false,
        antialias: true, 
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
        desynchronized: false 
    });
    
    // Fallback to WebGL 1
    if (!gl) {
        console.warn("WebGL 2 not supported, falling back to WebGL 1");
        gl = canvas.getContext('webgl', {
            alpha: false,
            depth: false,
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance"
        });
    }

    if (!gl) {
        infoText.innerText = "WebGL Error: Context Creation Failed";
        alert("WebGL not supported on this browser/device.");
        return;
    }

    // --- SHADERS ---
    const isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    
    console.log("WebGL Version:", isWebGL2 ? "2.0" : "1.0");
    infoText.innerText = isWebGL2 ? "Initializing WebGL 2..." : "Initializing WebGL 1...";
    
    if (isWebGL2) {
        // GLSL 3.00 ES
        vsSource = `#version 300 es
        in float aIndex;
        in float aDataL;
        in float aDataR;
        in float aVelocity;
        
        uniform vec2 uResolution;
        uniform vec2 uScale;
        uniform vec2 uOffset;
        uniform vec2 uShift;
        uniform int uMode;
        uniform float uTotalSamples;

        out float vVelocity;
        
        void main() {
            vVelocity = aVelocity;
            float x, y;
            if (uMode == 0) {
                float normalizedIndex = aIndex / uTotalSamples;
                // Apply Time Scale (uScale.y)
                // Center the zoom: (0..1 -> -1..1) / scale
                x = ((normalizedIndex * 2.0) - 1.0) / uScale.y;
                y = (aDataL / uScale.x) * 0.25; 
                y += (uOffset.x * 0.005);
            } else if (uMode == 1) { // XY Mode
                x = (aDataL / uScale.x) * 0.25;
                y = (aDataR / uScale.x) * 0.25;
            } else { // Mode 2: Full Screen Quad (Fade)
                float id = aIndex;
                x = (mod(id, 2.0) * 2.0) - 1.0; 
                y = (step(2.0, id) * 2.0) - 1.0; 
            }
            gl_Position = vec4(x, y, 0.0, 1.0);
            gl_Position.xy += uShift;
            gl_PointSize = 2.0;
        }`;
        
        fsSource = `#version 300 es
        precision mediump float;
        uniform vec4 uColor;
        uniform float uIntensity;
        uniform float uVelocitySens;
        in float vVelocity;
        out vec4 outColor;
        void main() {
            // Velocity Intensity Modulation
            // Higher velocity = lower brightness
            // Adjusted for smoother look: reduced sensitivity and added minimum brightness
            // Boosted brightness significantly
            // Velocity sensitivity tuned for better hiding of fast transients
            float vFactor = 1.0 + vVelocity * uVelocitySens;
            float brightness = 2.5 / vFactor; 
            
            // Non-linear falloff to kill very fast lines completely
            // Scale cutoff by sensitivity too? 
            // If sensitivity is high (30), vVelocity 0.5 -> factor 16.
            // If sensitivity is low (10), vVelocity 0.5 -> factor 6.
            // Let's keep the hard cutoff relative to the visual velocity
            // REMOVED
            // if (vVelocity > 0.5) brightness *= 0.1;
            
            outColor = uColor * uIntensity * brightness;
        }`;
    } else {
        // GLSL 1.00 ES
        vsSource = `
        attribute float aIndex;
        attribute float aDataL;
        attribute float aDataR;
        attribute float aVelocity;
        
        uniform vec2 uResolution;
        uniform vec2 uScale;
        uniform vec2 uOffset;
        uniform vec2 uShift;
        uniform int uMode;
        uniform float uTotalSamples;

        varying float vVelocity;
        
        void main() {
            vVelocity = aVelocity;
            float x, y;
            if (uMode == 0) {
                float normalizedIndex = aIndex / uTotalSamples;
                // Apply Time Scale (uScale.y)
                x = ((normalizedIndex * 2.0) - 1.0) / uScale.y;
                y = (aDataL / uScale.x) * 0.25; 
                y += (uOffset.x * 0.005);
            } else {
                x = (aDataL / uScale.x) * 0.25;
                y = (aDataR / uScale.x) * 0.25;
            }
            gl_Position = vec4(x, y, 0.0, 1.0);
            gl_Position.xy += uShift;
            gl_PointSize = 2.0;
        }`;
        
        fsSource = `
        precision mediump float;
        uniform vec4 uColor;
        uniform float uIntensity;
        uniform float uVelocitySens;
        varying float vVelocity;
        void main() {
            float scaledVel = vVelocity * uVelocitySens;
            float vFactor = 1.0 + pow(scaledVel, 0.8);
            float brightness = 4.0 / vFactor;
            brightness = max(brightness, 0.4);
            gl_FragColor = uColor * uIntensity * brightness;
        }`;
    }

    program = createProgram(gl, vsSource, fsSource);
    if (!program) {
        infoText.innerText = "WebGL Error: Shader Compilation Failed";
        return;
    }
    gl.useProgram(program);

    // Uniforms
    uResolution = gl.getUniformLocation(program, "uResolution");
    uScale = gl.getUniformLocation(program, "uScale");
    uOffset = gl.getUniformLocation(program, "uOffset");
    uShift = gl.getUniformLocation(program, "uShift");
    uMode = gl.getUniformLocation(program, "uMode");
    uColor = gl.getUniformLocation(program, "uColor");
    uIntensity = gl.getUniformLocation(program, "uIntensity");
    uTotalSamples = gl.getUniformLocation(program, "uTotalSamples");
    uVelocitySens = gl.getUniformLocation(program, "uVelocitySens");
    
    // Attributes
    const aIndex = gl.getAttribLocation(program, "aIndex");
    const aDataL = gl.getAttribLocation(program, "aDataL");
    const aDataR = gl.getAttribLocation(program, "aDataR");
    const aVelocity = gl.getAttribLocation(program, "aVelocity");
    attribs = { aIndex, aDataL, aDataR, aVelocity };

    // --- VAO SETUP ---
    let vaoExt = null;
    if (!isWebGL2) vaoExt = gl.getExtension('OES_vertex_array_object');

    if (isWebGL2) {
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
    } else if (vaoExt) {
        vao = vaoExt.createVertexArrayOES();
        vaoExt.bindVertexArrayOES(vao);
    }

    // Buffers
    bufferIndex = gl.createBuffer();
    const maxPoints = 65536; // Increased for upsampling
    indexArray = new Float32Array(maxPoints);
    velocityArray = new Float32Array(maxPoints);
    for(let i=0; i<maxPoints; i++) indexArray[i] = i;
    
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferIndex);
    gl.bufferData(gl.ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aIndex);
    gl.vertexAttribPointer(aIndex, 1, gl.FLOAT, false, 0, 0);

    bufferL = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferL);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(maxPoints), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aDataL);
    gl.vertexAttribPointer(aDataL, 1, gl.FLOAT, false, 0, 0);

    bufferR = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferR);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(maxPoints), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aDataR);
    gl.vertexAttribPointer(aDataR, 1, gl.FLOAT, false, 0, 0);
    
    bufferVelocity = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferVelocity);
    gl.bufferData(gl.ARRAY_BUFFER, velocityArray, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aVelocity);
    gl.vertexAttribPointer(aVelocity, 1, gl.FLOAT, false, 0, 0);

    // Unbind VAO
    if (isWebGL2) {
        gl.bindVertexArray(null);
    } else if (vaoExt) {
        vaoExt.bindVertexArrayOES(null);
    }
    
    gl.enable(gl.BLEND);
    resizeWebGL();
    
    // Initial Clear to BLACK (Ready)
    if(gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); 
        gl.clear(gl.COLOR_BUFFER_BIT);
        infoText.innerText = "Oscilloscope Ready. Power On to Start.";
    }
}

function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    const v = compileShader(gl, gl.VERTEX_SHADER, vs);
    const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    return p;
}

function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
    }
    return s;
}

function resizeWebGL() {
    if (!gl) return;
    const parent = canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    
    // Handle High DPI Displays
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(width * dpr);
    const displayHeight = Math.floor(height * dpr);

    // Check if size is valid
    if (width === 0 || height === 0) {
        console.warn("Canvas resize attempted with 0 dimensions");
        return;
    }

    // Resize canvas buffer if needed
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        
        // Ensure CSS size matches parent (so it doesn't shrink/grow weirdly)
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        gl.viewport(0, 0, displayWidth, displayHeight);
        gl.uniform2f(uResolution, displayWidth, displayHeight);
        console.log(`Canvas Resized to ${displayWidth}x${displayHeight} (DPR: ${dpr})`);
        
        // Force re-render after resize to prevent black screen
        renderFrame();
    }
}

// --- Initialization ---

function init() {
    console.log("Initializing Oscilloscope...");
    
    // Force Replace Canvas to ensure clean state
    const oldCanvas = document.getElementById('scopeCanvas');
    if (oldCanvas && oldCanvas.parentNode) {
         const newCanvas = oldCanvas.cloneNode(true);
         oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);
         canvas = newCanvas; // Global reassignment
         console.log("Canvas element replaced");
    }

    initWebGL();
    window.addEventListener('resize', resizeWebGL);
    
    // Initial resize to ensure correct size
    resizeWebGL();
    
    setupEventListeners();
    setupKnobs();
    updateColor(); 
    
    console.log("Initialization Complete");
}

function updateColorVals() {
    // Parse Colors locally
    if (currentPrimaryColor) {
        let hex = currentPrimaryColor;
        if (hex.startsWith('#')) hex = hex.slice(1);

        if (hex.length === 3) {
            // Expand short hex #RGB to #RRGGBB
            colorR = parseInt(hex[0] + hex[0], 16) / 255;
            colorG = parseInt(hex[1] + hex[1], 16) / 255;
            colorB = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length === 6) {
            colorR = parseInt(hex.slice(0, 2), 16) / 255;
            colorG = parseInt(hex.slice(2, 4), 16) / 255;
            colorB = parseInt(hex.slice(4, 6), 16) / 255;
        }
        
        // Safety fallback for NaN
        if (isNaN(colorR)) colorR = 0;
        if (isNaN(colorG)) colorG = 1;
        if (isNaN(colorB)) colorB = 0;
    }
}
function resize() { resizeWebGL(); }

// --- Drawing ---

function findTriggerIndex(data, level) {
    // Search in the most recent data to minimize latency
    // Search window: last 5000 samples
    const searchWindow = 5000;
    const start = Math.max(0, data.length - searchWindow);
    const end = data.length - 1;
    
    for (let i = start; i < end; i++) {
        if (data[i] <= level && data[i+1] > level) return i;
    }
    return -1;
}

// Catmull-Rom Interpolation Helper
function catmullRom(p0, p1, p2, p3, t) {
    const v0 = (p2 - p0) * 0.5;
    const v1 = (p3 - p1) * 0.5;
    const t2 = t * t;
    const t3 = t * t2;
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

// Temporary buffers for upsampling (reuse to avoid GC)
let upsampleL = new Float32Array(65536);
let upsampleR = new Float32Array(65536);

function renderFrame() {
    if (!gl) return;

    // Ensure we have data arrays (create dummy if missing)
    if (!dataArrayL) {
        // If startScope hasn't run, we don't have buffers.
        // We can just clear screen and return.
        gl.clearColor(0.1, 0.1, 0.1, 1.0); // Dark Grey Wait Screen
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    // Fade
    // Use Normal Blending for stability
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Clear screen ONLY if persistence is disabled (persist <= 0.2)
    // Otherwise, we rely on the fade quad to clear the screen over time
    if (persist <= 0.2) {
        gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent/Black
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.useProgram(program);
    
    // Safety: Ensure VAO is bound, but ALSO re-bind attributes to be 100% sure
    if (vao) {
        const isWebGL2 = (gl instanceof WebGL2RenderingContext);
        if (isWebGL2) gl.bindVertexArray(vao);
        else gl.getExtension('OES_vertex_array_object').bindVertexArrayOES(vao);
    }
    
    // Index Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferIndex);
    gl.enableVertexAttribArray(attribs.aIndex);
    gl.vertexAttribPointer(attribs.aIndex, 1, gl.FLOAT, false, 0, 0);
    
    // Data L
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferL);
    // Data is uploaded later, but binding is needed for pointer
    gl.enableVertexAttribArray(attribs.aDataL);
    gl.vertexAttribPointer(attribs.aDataL, 1, gl.FLOAT, false, 0, 0);
    
    // Velocity
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferVelocity);
    gl.enableVertexAttribArray(attribs.aVelocity);
    gl.vertexAttribPointer(attribs.aVelocity, 1, gl.FLOAT, false, 0, 0);

    const drawCount = dataArrayL.length;

    // Trigger Logic
    // Default to showing the most recent data (last 5000 samples)
    let startIndex = Math.max(0, drawCount - 5000);
    let count = drawCount;
    
    if (displayMode === 'time') {
        const idx = findTriggerIndex(dataArrayL, trigLevel);
        
        if (idx !== -1) {
            startIndex = idx;
        } else if (trigMode === 'normal') {
            return; // Wait for trigger
        }
        
        // Limit count to fit buffer
        if (startIndex + count > drawCount) count = drawCount - startIndex;
    }
    
    if (displayMode === 'xy') {
        // Limit draw count in XY mode to prevent messy "history blobs"
        // 4096 points is plenty for XY (approx 85ms @ 48kHz)
        count = Math.min(count, 4096);
        
        // --- UPSAMPLING (XY MODE) ---
        // Catmull-Rom Spline Interpolation to smooth jagged lines
        // 2x upsampling
        if (count > 3) {
            let upIdx = 0;
            for (let i = startIndex; i < startIndex + count - 3; i++) {
                const p0L = dataArrayL[i];
                const p1L = dataArrayL[i+1];
                const p2L = dataArrayL[i+2];
                const p3L = dataArrayL[i+3];
                
                const p0R = dataArrayR[i];
                const p1R = dataArrayR[i+1];
                const p2R = dataArrayR[i+2];
                const p3R = dataArrayR[i+3];

                // Original point
                upsampleL[upIdx] = p1L;
                upsampleR[upIdx] = p1R;
                upIdx++;
                
                // Interpolated point (t=0.5)
                upsampleL[upIdx] = catmullRom(p0L, p1L, p2L, p3L, 0.5);
                upsampleR[upIdx] = catmullRom(p0R, p1R, p2R, p3R, 0.5);
                upIdx++;
            }
            // Use the upsampled data
            // We need to update count and startIndex relative to new buffer
            count = upIdx;
            startIndex = 0; // New buffer starts at 0
            // We'll use upsampleL/R instead of dataArrayL/R for the rest of this frame
        }
    }
    
    // --- VELOCITY CALCULATION ---
    // Calculate velocity for the points we are about to draw
    const scaleFactor = 1.0 / Math.max(0.001, vScale);
    
    velocityArray[0] = 0; // First point has no velocity relative to previous
    
    if (displayMode === 'xy') {
        // Use upsampled data if we did upsampling
        const srcL = (startIndex === 0 && count > 4096) ? upsampleL : dataArrayL;
        const srcR = (startIndex === 0 && count > 4096) ? upsampleR : dataArrayR;
        
        for (let i = 1; i < count; i++) {
            const idx = startIndex + i;
            const prevIdx = startIndex + i - 1;
            const dx = (srcL[idx] - srcL[prevIdx]) * scaleFactor;
            const dy = (srcR[idx] - srcR[prevIdx]) * scaleFactor;
            // Euclidean distance
            // Scale velocity by upsampling factor (2x) to keep brightness consistent
            // Actually, distance is smaller, so velocity is smaller. 
            // We want same visual brightness for same "speed" across screen.
            // If we double points, distance halves. Velocity value halves.
            // We need to boost it to match shader expectation?
            // Or just let it be smoother.
            velocityArray[i] = Math.sqrt(dx*dx + dy*dy) * 2.0; 
        }
    } else {
        // Time Mode
        for (let i = 1; i < count; i++) {
            const idx = startIndex + i;
            const prevIdx = startIndex + i - 1;
            // Y slew rate
            const dy = (dataArrayL[idx] - dataArrayL[prevIdx]) * scaleFactor;
            velocityArray[i] = Math.abs(dy);
        }
    }

    // --- DRAW PASS ---
    
    // --- FADE PASS (Persistence) ---
    // Draw a full screen quad with low opacity black to fade previous frame
    if (persist < 1.0) {
        gl.uniform1i(uMode, 2); // Mode 2 = Quad
        gl.uniform2f(uShift, 0.0, 0.0);
        
        let fadeAlpha = Math.max(0.05, 1.0 - persist);
        
        // Faster fade for XY mode to prevent mess
        if (displayMode === 'xy') {
             // Super aggressive fade for XY to avoid "ghost steps"
             // If persist is < 0.95, basically clear the screen
             if (persist < 0.95) {
                fadeAlpha = Math.max(0.2, fadeAlpha * 3.0);
             }
        }
        
        gl.uniform4f(uColor, 0.0, 0.0, 0.0, fadeAlpha); 
        // No attributes needed for quad if we generate coords in shader from ID
        // But we need to bind something to satisfy attributes if strict?
        // Our shader uses aIndex.
        
        // Just draw 4 points
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Use Additive Blending for "Glow" look
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); 
    
    // VAO is already bound at start of frame
    
    // Upload Data
    // Check if we are using upsampled data
    const usingUpsample = (displayMode === 'xy' && startIndex === 0 && count > 4096);
    
    const subL = usingUpsample ? upsampleL.subarray(0, count) : dataArrayL.subarray(startIndex, startIndex + count);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferL);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subL);
    
    // Explicitly bind attrib if no VAO (robustness)
    if (!vao) {
        gl.enableVertexAttribArray(attribs.aDataL);
        gl.vertexAttribPointer(attribs.aDataL, 1, gl.FLOAT, false, 0, 0);
    }
    
    if (displayMode === 'xy') {
        const subR = usingUpsample ? upsampleR.subarray(0, count) : dataArrayR.subarray(startIndex, startIndex + count);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferR);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, subR);
        gl.enableVertexAttribArray(attribs.aDataR);
        if (!vao) {
            gl.vertexAttribPointer(attribs.aDataR, 1, gl.FLOAT, false, 0, 0);
        }
    } else {
        gl.disableVertexAttribArray(attribs.aDataR);
        gl.vertexAttrib1f(attribs.aDataR, 0.0);
    }
    
    // Upload Velocity
    const subV = velocityArray.subarray(0, count);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferVelocity);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subV);
    
    // FORCE RE-BIND ALWAYS
    gl.enableVertexAttribArray(attribs.aVelocity);
    gl.vertexAttribPointer(attribs.aVelocity, 1, gl.FLOAT, false, 0, 0);
    
    // Uniforms
    gl.uniform2f(uScale, Math.max(0.001, vScale), Math.max(0.001, hScale / 10.0));
    gl.uniform2f(uOffset, vPos * 0.01, 0.0);
    gl.uniform1i(uMode, displayMode === 'xy' ? 1 : 0);
    gl.uniform1f(uTotalSamples, Math.max(1.0, count));
    gl.uniform1f(uVelocitySens, velSens);
    
    // Use Real Color
    gl.uniform4f(uColor, colorR, colorG, colorB, 1.0);
    
    // Apply Focus (Simulate by modulating intensity/line width)
    // Less penalty for defocus
    const focusMod = Math.max(0.6, focus); 
    gl.uniform1f(uIntensity, Math.max(0.1, intensity * focusMod));
    
    // Attempt Line Width
    gl.lineWidth(Math.max(1.0, (1.0 - focus) * 5.0)); 
    
    // --- GLOW EFFECT (Multi-pass) ---
    if (count > 1) {
        // Base intensity calculated above
        const baseIntensity = Math.max(0.1, intensity * focusMod);
        
        // Pixel size in NDC (2.0 / resolution)
        const pixelX = 2.0 / gl.canvas.width;
        const pixelY = 2.0 / gl.canvas.height;
        
        // --- 1. Halo Pass (Wide, Faint, P31 Green) ---
        // Simulates the electron scattering / phosphor bloom
        gl.uniform4f(uColor, colorR, colorG, colorB, 1.0);
        gl.uniform1f(uIntensity, baseIntensity * 0.15); // Very faint but cumulative
        
        // Wide spread
        const blurAmount = 2.0 + ((1.0 - focus) * 4.0);
        const bx = pixelX * blurAmount;
        const by = pixelY * blurAmount;
        
        // 8-point box/circle approximation
        const glowOffsets = [
            [bx, 0], [-bx, 0], [0, by], [0, -by],
            [bx*0.7, by*0.7], [-bx*0.7, -by*0.7], [bx*0.7, -by*0.7], [-bx*0.7, by*0.7]
        ];
        
        for(let i=0; i<glowOffsets.length; i++) {
            gl.uniform2f(uShift, glowOffsets[i][0], glowOffsets[i][1]);
            gl.drawArrays(gl.LINE_STRIP, 0, count);
        }

        // --- 2. Beam Body Pass (Medium, Brighter) ---
        // Simulates the main width of the beam
        gl.uniform1f(uIntensity, baseIntensity * 0.4);
        const beamWidth = 0.8 + ((1.0 - focus) * 1.5);
        const bwx = pixelX * beamWidth;
        const bwy = pixelY * beamWidth;
        
        // 5-point cross (center + immediate neighbors)
        const bodyOffsets = [
            [bwx, 0], [-bwx, 0], [0, bwy], [0, -bwy]
        ];
        
        for(let i=0; i<bodyOffsets.length; i++) {
            gl.uniform2f(uShift, bodyOffsets[i][0], bodyOffsets[i][1]);
            gl.drawArrays(gl.LINE_STRIP, 0, count);
        }

        // --- 3. Core Pass (Hot, White-ish) ---
        // Simulates the saturated center
        // Mix current color with white for the "hot" look
        // High saturation for analog "burn" look
        const whiteMix = 0.9; // Almost pure white center
        const coreR = colorR + (1.0 - colorR) * whiteMix;
        const coreG = colorG + (1.0 - colorG) * whiteMix;
        const coreB = colorB + (1.0 - colorB) * whiteMix;
        
        gl.uniform4f(uColor, coreR, coreG, coreB, 1.0);
        gl.uniform1f(uIntensity, baseIntensity * 2.0); // Extremely bright core
        gl.uniform2f(uShift, 0.0, 0.0);
        gl.drawArrays(gl.LINE_STRIP, 0, count);
    }
    
    // Unbind VAO
    if (vao) {
        const isWebGL2 = (gl instanceof WebGL2RenderingContext);
        if (isWebGL2) gl.bindVertexArray(null);
        else gl.getExtension('OES_vertex_array_object').bindVertexArrayOES(null);
    }
}


function setupEventListeners() {
    powerBtn.addEventListener('click', togglePower);
    
    // Input Listeners (triggered by Knobs or direct interaction if enabled)
    vScaleInput.addEventListener('input', (e) => { vScale = parseFloat(e.target.value); });
    vPosInput.addEventListener('input', (e) => { vPos = parseFloat(e.target.value); });
    hScaleInput.addEventListener('input', (e) => { hScale = parseFloat(e.target.value); });
    trigLevelInput.addEventListener('input', (e) => { trigLevel = parseFloat(e.target.value); });
    trigModeInput.addEventListener('change', (e) => { trigMode = e.target.value; });
    displayModeSelect.addEventListener('change', (e) => { displayMode = e.target.value; });
    
    // Coupling Mode
    if(couplingModeSelect) {
        couplingModeSelect.addEventListener('change', (e) => {
            couplingMode = e.target.value;
            // Generate a random DC offset when switching to DC mode if signal is synthetic
            // Real audio hardware often has DC offsets, but WebAudio filters them usually.
            // We'll simulate a small random offset for realism in DC mode.
            if (couplingMode === 'dc') {
                dcOffset = (Math.random() - 0.5) * 0.5; // +/- 0.25V offset
            } else {
                dcOffset = 0;
            }
        });
    }

    signalTypeInput.addEventListener('change', changeSignalSource);
    audioDeviceSelect.addEventListener('change', changeSignalSource);
    
    // File Input Listeners
    audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            audioPlayer.src = objectUrl;
            audioPlayer.play();
        }
    });
    
    colorModeSelect.addEventListener('change', updateColor);
    intensityInput.addEventListener('input', (e) => { intensity = parseFloat(e.target.value); });
    focusInput.addEventListener('input', (e) => { focus = parseFloat(e.target.value); });
    gridIntensityInput.addEventListener('input', (e) => {
        gridIntensity = parseFloat(e.target.value);
        updateColor();
    });
    persistInput.addEventListener('input', (e) => {
        persist = parseFloat(e.target.value);
        updateColor();
    });
    velSensInput.addEventListener('input', (e) => {
        velSens = parseFloat(e.target.value);
    });
    
    micSensitivityInput.addEventListener('input', updateSensitivity);
    sigFreqInput.addEventListener('input', (e) => { updateFrequency(); });
    
    // Auto-update device list
    if (navigator.mediaDevices) {
        navigator.mediaDevices.ondevicechange = populateAudioDevices;
    }
}

// --- Knob Logic ---

function setupKnobs() {
    const knobs = document.querySelectorAll('.knob');
    
    knobs.forEach(knob => {
        const inputId = knob.dataset.for;
        const input = document.getElementById(inputId);
        const valueDisplay = document.getElementById(`val-${inputId}`);
        const isLog = knob.dataset.scale === 'log';
        
        if (!input) return;

        // Initial update
        updateKnobVisuals(knob, input, valueDisplay);

        // Mouse interaction
        let startY = 0;
        let startValue = 0;

        knob.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startValue = parseFloat(input.value);
            
            const onMouseMove = (moveEvent) => {
                const deltaY = startY - moveEvent.clientY;
                const step = parseFloat(input.step) || 1;
                const min = parseFloat(input.min);
                const max = parseFloat(input.max);
                
                let newValue;

                if (isLog && min > 0) {
                    // Logarithmic Scaling
                    const logMin = Math.log(min);
                    const logMax = Math.log(max);
                    const currentLog = Math.log(Math.max(min, startValue));
                    const rangeLog = logMax - logMin;
                    const p = (currentLog - logMin) / rangeLog;
                    
                    // Sensitivity: 200px = full range
                    let newP = p + (deltaY / 200);
                    newP = Math.min(Math.max(newP, 0), 1);
                    
                    newValue = Math.exp(logMin + (newP * rangeLog));
                } else {
                    // Linear Scaling
                    const range = max - min;
                    const change = (deltaY / 200) * range;
                    newValue = startValue + change;
                }
                
                // Snap to step
                newValue = Math.round(newValue / step) * step;
                
                // Clamp
                newValue = Math.min(Math.max(newValue, min), max);
                
                if (newValue !== parseFloat(input.value)) {
                    input.value = newValue;
                    // Trigger input event for the app logic
                    input.dispatchEvent(new Event('input'));
                    updateKnobVisuals(knob, input, valueDisplay);
                }
            };

            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
        
        // Listen for external changes to input (e.g. if we set it via JS)
        input.addEventListener('input', () => updateKnobVisuals(knob, input, valueDisplay));
    });
}

function updateKnobVisuals(knob, input, valueDisplay) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const val = parseFloat(input.value);
    const isLog = knob.dataset.scale === 'log';
    
    let percent;
    if (isLog && min > 0) {
         const logMin = Math.log(min);
         const logMax = Math.log(max);
         const currentLog = Math.log(Math.max(min, val));
         percent = (currentLog - logMin) / (logMax - logMin);
    } else {
        percent = (val - min) / (max - min);
    }
    
    const angle = -135 + (percent * 270);
    knob.style.transform = `rotate(${angle}deg)`;
    
    if (valueDisplay) {
        if (input.id === 'vScale') {
             if (val < 1) {
                 valueDisplay.textContent = (val * 1000).toFixed(0) + 'mV';
             } else {
                 valueDisplay.textContent = val.toFixed(2) + 'V';
             }
        } else {
            const step = input.step;
            if (step && step.includes('.')) {
                const decimals = step.split('.')[1].length;
                valueDisplay.textContent = val.toFixed(decimals);
            } else {
                valueDisplay.textContent = Math.round(val);
            }
        }
    }
}

// --- App Logic ---

function updateSensitivity() {
    micSensitivity = parseFloat(micSensitivityInput.value);
    if (gainNode) {
        gainNode.gain.value = micSensitivity;
    }
}

function updateFrequency() {
    sigFreq = parseFloat(sigFreqInput.value);
    if (oscillator) {
        oscillator.frequency.setValueAtTime(sigFreq, audioCtx.currentTime);
    }
}

function updateColor() {
    colorMode = colorModeSelect.value;
    const c = COLORS[colorMode];
    
    currentPrimaryColor = c.primary;
    currentShadowColor = c.shadow;
    currentGridColor = c.grid;
    
    // Update text color
    infoText.style.color = currentPrimaryColor;
    infoText.style.textShadow = `0 0 5px ${currentShadowColor}`;
    
    // Update grid color & opacity
    const gridEl = document.querySelector('.grid-lines');
    gridEl.style.setProperty('--grid-color', currentGridColor);
    gridEl.style.opacity = gridIntensity;

    // Update persistence fade color
    // Low persist (0.1) -> High alpha (fast clear)
    // High persist (0.9) -> Low alpha (slow clear)
    const fadeAlpha = 1.0 - persist; 
    fadeColor = `rgba(0, 0, 0, ${Math.max(0.01, fadeAlpha)})`;
    
    updateColorVals();
}

async function togglePower() {
    if (isToggling) return;
    isToggling = true;
    
    // Simple Toggle Logic
    if (isRunning) {
        // TURN OFF
        await stopScope();
        powerBtn.classList.remove('on');
        console.log("Scope Turned OFF");
    } else {
        // TURN ON
        try {
            powerBtn.classList.add('on'); // Visual feedback immediately
            await startScope();
            console.log("Scope Turned ON");
        } catch (err) {
            console.error("Failed to start scope:", err);
            powerBtn.classList.remove('on'); // Revert if failed
            await stopScope(); // Cleanup
            alert("Could not start audio: " + err.message);
        }
    }
    
    isToggling = false;
}

async function startScope() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        // Create Stereo Graph
        analyserL = audioCtx.createAnalyser();
        analyserL.fftSize = 16384; // Good balance of resolution and latency
        analyserR = audioCtx.createAnalyser();
        analyserR.fftSize = 16384;

        bufferLength = analyserL.frequencyBinCount;
        dataArrayL = new Float32Array(analyserL.fftSize);
        dataArrayR = new Float32Array(analyserR.fftSize);

        splitter = audioCtx.createChannelSplitter(2);
        
        // Connect Splitter to Analysers
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);

        gainNode = audioCtx.createGain();
        gainNode.gain.value = micSensitivity;
        gainNode.connect(splitter);

        await changeSignalSource();

        isRunning = true;
        draw();
    } catch (e) {
        isRunning = false;
        throw e; // Re-throw to be caught by togglePower
    }
}

async function stopScope() {
    console.log("Stopping Scope...");
    isRunning = false;
    cancelAnimationFrame(animationId);
    
    // Disconnect and clean up nodes
    if (sourceNode) {
        try { sourceNode.disconnect(); } catch(e) {}
    }
    if (gainNode) {
        try { gainNode.disconnect(); } catch(e) {}
    }
    
    if (oscillator) {
        try { oscillator.stop(); } catch(e) {}
        oscillator = null;
    }
    
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    
    // Suspend AudioContext to release hardware
    if (audioCtx && audioCtx.state !== 'closed') {
        try { await audioCtx.suspend(); } catch(e) { console.warn("Suspend failed", e); }
    }
    
    // Clear the screen (Power Off effect)
    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    console.log("Scope Stopped");
}

async function populateAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const currentSelection = audioDeviceSelect.value;
        audioDeviceSelect.innerHTML = '';
        
        if (audioInputs.length === 0) {
            const option = document.createElement('option');
            option.text = "No Inputs Found";
            option.disabled = true;
            audioDeviceSelect.appendChild(option);
        } else {
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioDeviceSelect.length + 1}`;
                audioDeviceSelect.appendChild(option);
            });
        }

        if (currentSelection && Array.from(audioDeviceSelect.options).some(opt => opt.value === currentSelection)) {
            audioDeviceSelect.value = currentSelection;
        } else if (audioInputs.length > 0) {
            // Select first available if previous not found
            audioDeviceSelect.value = audioInputs[0].deviceId;
        }
        
        // Ensure it's visible if we have inputs or even if empty (to show "No Inputs")
        if (signalTypeInput.value === 'mic') {
            audioDeviceSelect.style.display = 'block';
        }

    } catch (err) {
        console.error("Error listing audio devices:", err);
    }
}

async function changeSignalSource() {
    if (!audioCtx) return;

    if (sourceNode) sourceNode.disconnect();
    
    // Reset Oscillator/Mic
    if (oscillator) {
        try { oscillator.stop(); } catch(e) {}
        oscillator = null;
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    signalType = signalTypeInput.value;

    // UI Updates
    const isMic = signalType === 'mic';
    const isFile = signalType === 'file';

    audioDeviceSelect.style.display = isMic ? 'block' : 'none';
    micSensitivityControl.style.display = isMic ? 'flex' : 'none';
    fileControl.style.display = isFile ? 'flex' : 'none';

    // Disconnect gainNode from destination (reset output)
    try { gainNode.disconnect(audioCtx.destination); } catch(e) {}

    if (isFile) {
        if (!fileSourceNode) {
            fileSourceNode = audioCtx.createMediaElementSource(audioPlayer);
        }
        sourceNode = fileSourceNode;
        sourceNode.connect(gainNode);
        // Connect to output so we can hear the music
        gainNode.connect(audioCtx.destination);
    } else if (isMic) {
        try {
            const constraints = { audio: { 
                deviceId: audioDeviceSelect.value ? { exact: audioDeviceSelect.value } : undefined,
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                sampleRate: 48000
            } };
            console.log("Requesting Mic Access...", constraints);
            micStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            await populateAudioDevices();
            
            // Sync initial selection
            if (!audioDeviceSelect.value) {
                 const track = micStream.getAudioTracks()[0];
                 const settings = track.getSettings();
                 if (settings.deviceId) audioDeviceSelect.value = settings.deviceId;
            }

            sourceNode = audioCtx.createMediaStreamSource(micStream);
            sourceNode.connect(gainNode);
        } catch (err) {
            console.error("Mic access denied", err);
            await populateAudioDevices(); // Ensure we show what we can
        }
    } else if (['sine', 'square', 'sawtooth', 'triangle'].includes(signalType)) {
        oscillator = audioCtx.createOscillator();
        oscillator.type = signalType;
        oscillator.frequency.setValueAtTime(sigFreq, audioCtx.currentTime);
        oscillator.start();
        sourceNode = oscillator;
        sourceNode.connect(gainNode);
    } else if (signalType === 'noise') {
        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = buffer;
        sourceNode.loop = true;
        sourceNode.start();
        sourceNode.connect(gainNode);
    }
}

function draw() {
    if (!isRunning) {
        // Even if not running, keep animation loop for debug background
        // requestAnimationFrame(draw); // Optional: enable if we want continuous debug rendering
        return; 
    }
    animationId = requestAnimationFrame(draw);
    
    // Render directly
    if (analyserL && analyserR) {
        // Update info text
        let modeText = displayMode === 'xy' ? 'X-Y Mode' : `Time: ${hScale.toFixed(1)}ms/div`;
        const infoString = `CH1: ${vScale.toFixed(1)}V/div  ${modeText}  Freq: ${sigFreq}Hz`;
        if (infoString !== lastInfoString) {
            infoText.innerText = infoString;
            lastInfoString = infoString;
        }

        // Get time domain data
        analyserL.getFloatTimeDomainData(dataArrayL);
        analyserR.getFloatTimeDomainData(dataArrayR);
    }
    
    renderFrame();
}

// Start the app
init();