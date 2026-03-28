/* 
    Trinetra App Logic 
    - Loads TF.js COCO-SSD Model
    - Captures Camera Stream
    - Checks direction continuously every second
    - Speaks ONLY on state changes
*/

const video = document.getElementById('videoElement');
const canvas = document.getElementById('canvasElement');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnRemember = document.getElementById('btnRemember');
const statusText = document.getElementById('statusText');
const directionArrows = document.getElementById('directionArrows');
const voiceToggle = document.getElementById('voiceToggle');

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// Modal Elements
const nameModal = document.getElementById('nameModal');
const personNameInput = document.getElementById('personNameInput');
const btnSaveName = document.getElementById('btnSaveName');
const btnCancelName = document.getElementById('btnCancelName');

// UI Icons
const ICON_UP = `<svg class="icon arrow-up" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-8 8h6v8h4v-8h6z"/></svg>`;
const ICON_LEFT = `<svg class="icon arrow-left" viewBox="0 0 24 24" fill="currentColor"><path d="M20 12l-8-8v6H4v4h8v6z"/></svg>`;
const ICON_RIGHT = `<svg class="icon arrow-right" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l8 8v-6h8v-4h-8V4z"/></svg>`;
const ICON_STOP = `<svg class="icon icon-stop" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>`;

// App State
let model = null;
let isScanning = false;
let animationId = null;
let videoStream = null;

// Face API State
let knownFaces = [];
let pendingFaceDescriptor = null;
let pendingFaceImage = null;
let isCapturingMode = false;

// The Guidance State System
let lastAnalysisTime = 0;
let lastSpokenGuidance = "";

// Initialize AI Models
async function init() {
    try {
        loadingText.innerText = "Connecting to AI Core...";
        // Use the native node-downloaded 'lite' model to ensure zero file corruption!
        model = await cocoSsd.load({ 
            base: 'lite_mobilenet_v2',
            modelUrl: '/models/coco-ssd-lite/model.json' 
        });
        
        loadingText.innerText = "Loading Face Features...";
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');

        // Check if faces were previously saved
        loadSavedFaces();

        loadingOverlay.classList.add('hidden');
        statusText.innerText = "System Ready. Press Start Scan.";
        speak("System Ready. Please press start scan.");

    } catch (err) {
        console.error("Critical AI Error:", err);
        loadingText.innerText = "AI Load Error: " + err.message;
        const msg = "Error: Failed to load AI models. Please ensure the app is fully installed. Detail: " + err.message;
        speak(msg);
        statusText.innerText = "AI Offline. Check app permissions.";
        statusText.style.color = "var(--danger)";
    }
}

// Start Camera Stream
async function startApp() {
    btnStart.disabled = true;
    try {
        // --- SPEECH SYNTHESIS WARM-UP --- 
        // Some Android browsers require the first speech to be directly within a user-click event.
        if ('speechSynthesis' in window) {
            const warmup = new SpeechSynthesisUtterance("Initializing audio"); // Or just an empty string
            warmup.volume = 0; // Silent
            window.speechSynthesis.speak(warmup);
        }

        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });
        video.srcObject = videoStream;
        
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            isScanning = true;
            btnStop.disabled = false;
            btnRemember.disabled = false;
            
            lastAnalysisTime = 0;
            lastSpokenGuidance = "";
            
            statusText.innerText = "Scanning environment...";
            speak("Scanner started.");
            
            detectFrame();
        };

    } catch (err) {
        console.error("Camera error:", err);
        statusText.innerText = "Camera access denied.";
        btnStart.disabled = false;
    }
}

// Stop Scanning
function stopApp() {
    isScanning = false;
    btnStop.disabled = true;
    btnRemember.disabled = true;
    btnStart.disabled = false;
    
    if (animationId) cancelAnimationFrame(animationId);
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    video.srcObject = null;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statusText.innerText = "Scan stopped.";
    directionArrows.innerHTML = ICON_UP;
    document.querySelector('.app-container').style.boxShadow = "none";
    statusText.style.color = "var(--text-color)";
    
    speak("Scanner stopped.");
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    lastSpokenGuidance = "";
}

// Detection Loop
async function detectFrame() {
    if (!isScanning) return;
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    try {
        const predictions = await model.detect(video);
        // Lowered threshold to 45% so things like chairs and tables trigger more reliably
        const validPredictions = predictions.filter(p => p.score > 0.45);
        
        drawBoundingBoxes(validPredictions);
        
        // Logical update continuously every 1 second
        const now = Date.now();
        if (now - lastAnalysisTime >= 1000) {
            await analyzeAndGuide(validPredictions);
            lastAnalysisTime = now;
        }

    } catch (e) {
        console.error(e);
    }
    
    animationId = requestAnimationFrame(detectFrame);
}

// Bounding Box Visualization
function drawBoundingBoxes(items) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    items.forEach(item => {
        const [x, y, w, h] = item.bbox;
        ctx.strokeStyle = "#10b981"; 
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);
        
        ctx.fillStyle = "#10b981";
        const labelText = `${item.class} ${Math.round(item.score * 100)}%`;
        ctx.font = "bold 16px Inter, sans-serif";
        const textWidth = ctx.measureText(labelText).width;
        
        ctx.fillRect(x, Math.max(y - 28, 0), textWidth + 12, 28);
        
        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, x + 6, Math.max(y - 8, 20));
    });
}

// Analytics and Navigation Strategy
async function analyzeAndGuide(predictions) {
    if (predictions.length === 0) {
        updateGuidance("Path is clear", "clear", ICON_UP, "");
        return;
    }
    
    // Nearest object calculation based on bounding box area
    let objects = predictions.map(p => {
        return {
            ...p,
            area: p.bbox[2] * p.bbox[3],
            centerX: p.bbox[0] + (p.bbox[2] / 2),
            displayName: p.class
        };
    });
    
    // Check if any object is a person, if so, run facial recognition
    const persons = objects.filter(o => o.class === 'person');
    if (persons.length > 0 && knownFaces.length > 0 && !isCapturingMode) {
        const faceMatcher = new faceapi.FaceMatcher(knownFaces, 0.60); 
        const faceOptions = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.2, inputSize: 320 }); 
        
        try {
            const detections = await faceapi.detectAllFaces(video, faceOptions).withFaceLandmarks().withFaceDescriptors();
            
            if (detections.length > 0) {
                // Find best matches for detected faces
                for (const detection of detections) {
                    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                    if (bestMatch.label !== 'unknown') {
                        // Update the largest person object with this specific name
                        const largestPerson = persons.reduce((prev, current) => (prev.area > current.area) ? prev : current);
                        largestPerson.displayName = bestMatch.label;
                    }
                }
            }
        } catch (e) {
            console.error("Continuous Face API Error:", e);
        }
    }
    
    objects.sort((a, b) => b.area - a.area);
    
    // Divide screen into 5 zones for peripheral vision
    const w = video.videoWidth;
    const w5 = w / 5;
    
    const obsFarLeft = [];
    const obsInnerLeft = [];
    const obsCenter = [];
    const obsInnerRight = [];
    const obsFarRight = [];
    
    objects.forEach(o => {
        if (o.centerX < w5) obsFarLeft.push(o);
        else if (o.centerX < w5 * 2) obsInnerLeft.push(o);
        else if (o.centerX < w5 * 3) obsCenter.push(o);
        else if (o.centerX < w5 * 4) obsInnerRight.push(o);
        else obsFarRight.push(o);
    });
    
    let state = "";
    let guidanceMsg = "";
    let icon = "";
    let colorVar = "";
    
    // Direct Path (Center & Inner)
    if (obsCenter.length > 0) {
        state = "center";
        guidanceMsg = `${obsCenter[0].displayName} ahead, stop or move carefully`;
        icon = ICON_STOP;
        colorVar = "--danger";
    }
    else if (obsInnerLeft.length > 0) {
        state = "left";
        guidanceMsg = `${obsInnerLeft[0].displayName} on left, move right`;
        icon = ICON_RIGHT; 
        colorVar = "--success";
    }
    else if (obsInnerRight.length > 0) {
        state = "right";
        guidanceMsg = `${obsInnerRight[0].displayName} on right, move left`;
        icon = ICON_LEFT; 
        colorVar = "--success";
    }
    // Peripheral Path (Far Edges)
    else if (obsFarLeft.length > 0) {
        state = "farLeft";
        guidanceMsg = `${obsFarLeft[0].displayName} approaching from far left`;
        icon = ICON_RIGHT; // Suggest minor correction
        colorVar = "--text-color"; // Not immediate danger
    }
    else if (obsFarRight.length > 0) {
        state = "farRight";
        guidanceMsg = `${obsFarRight[0].displayName} approaching from far right`;
        icon = ICON_LEFT; // Suggest minor correction
        colorVar = "--text-color"; // Not immediate danger
    }
    
    updateGuidance(guidanceMsg, state, icon, colorVar);
}

// DOM & Voice Manager
function updateGuidance(msg, state, svgIcon, colorVar) {
    statusText.innerText = msg;
    directionArrows.innerHTML = svgIcon;
    
    const appWrapper = document.querySelector('.app-container');
    if (colorVar === "--danger") {
        appWrapper.style.boxShadow = "inset 0 0 50px rgba(239, 68, 68, 0.2)";
        statusText.style.color = "var(--danger)";
    } else if (colorVar === "--success") {
        appWrapper.style.boxShadow = "inset 0 0 50px rgba(16, 185, 129, 0.1)";
        statusText.style.color = "var(--success)";
    } else {
        appWrapper.style.boxShadow = "none";
        statusText.style.color = "var(--text-color)";
    }

    // Announce ONLY when direction changes
    if (msg !== lastSpokenGuidance) {
        speak(msg);
        lastSpokenGuidance = msg;
    }
}

async function speak(text) {
    if (!voiceToggle.checked) return;
    
    // Play a long beep and vibrate to confirm the guidance system is active
    playBeep(440, 0.4); 
    if ('vibrate' in navigator) navigator.vibrate(150);

    // Debug info for the user
    statusText.innerText = "Guide: " + text;
    console.log("Speaking: " + text);

    // 1. Try Native Capacitor TTS (Most reliable for APK)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech) {
        try {
            await window.Capacitor.Plugins.TextToSpeech.speak({
                text: text,
                lang: 'en-US',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                category: 'ambient'
            });
            return;
        } catch (e) {
            console.error("Native TTS Error:", e);
        }
    }

    // 2. Fallback to Web Speech Synthesis (with volume/voice boost)
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.volume = 1.0;
        utterance.rate = 1.0; 
        utterance.pitch = 1.0;
        
        // Ensure voices are loaded
        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.speak(utterance);
            };
        } else {
            window.speechSynthesis.speak(utterance);
        }
    }
}

// ---- FACE MEMORIZATION LOGIC ---- //

// Load saved face descriptors from Local Storage (Device Only)
async function loadSavedFaces() {
    // 1. Check LocalStorage first (The primary storage for APK/PWA)
    const localData = localStorage.getItem('trinetra_faces_v2');
    if (localData) {
        try {
            const saved = JSON.parse(localData);
            if (saved && saved.length > 0) {
                knownFaces = saved.map(record => {
                    const arr = new Float32Array(record.descriptor);
                    return new faceapi.LabeledFaceDescriptors(record.label, [arr]);
                });
                console.log(`Loaded ${knownFaces.length} known faces from device storage.`);
                return;
            }
        } catch (e) {
            console.error("Local storage parse error:", e);
        }
    }

    // 2. Fallback to Backend Server (Only if running on Desktop with node server)
    try {
        const res = await fetch('/api/faces');
        if (res.ok) {
            const saved = await res.json();
            if (saved && saved.length > 0) {
                knownFaces = saved.map(record => {
                    const arr = new Float32Array(Object.values(record.descriptor));
                    return new faceapi.LabeledFaceDescriptors(record.label, [arr]);
                });
                console.log(`Loaded ${knownFaces.length} known faces from backend server.`);
            }
        }
    } catch (e) {
        // Silent fail as this is expected on mobile APK without node server
    }
}

// Trigger capture from camera
async function captureFace() {
    if (!isScanning || isCapturingMode) return;
    
    // Set flag so background face scanner doesn't clash
    isCapturingMode = true;
    
    // 1. Play Shutter Sound & Capture Photo IMMEDIATELY on click
    playShutterSound();
    capturePhotoGraphic();
    
    statusText.innerText = "Analyzing captured photo...";
    
    // Wait for the visual flash to render
    await new Promise(r => setTimeout(r, 100));
    
    // 2. Load the captured image to run face detection precisely on that saved frame
    const imgElement = new Image();
    imgElement.src = pendingFaceImage;
    await new Promise(resolve => { imgElement.onload = resolve; });

    let detection = null;
    const faceOptions = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.15, inputSize: 416 }); 

    try {
        detection = await faceapi.detectSingleFace(imgElement, faceOptions).withFaceLandmarks().withFaceDescriptor();
    } catch (e) {
        console.error("Face capture error:", e);
    }
    
    if (!detection) {
        speak("I couldn't find a face in that photo. Please get closer and try again.");
        statusText.innerText = "Face Capture Failed.";
        pendingFaceImage = null;
        isCapturingMode = false;
        return;
    }
    
    // 3. Ask Name
    pendingFaceDescriptor = detection.descriptor;
    nameModal.classList.remove('hidden');
    personNameInput.value = "";
    personNameInput.focus();
    speak("Face captured! Please type the name.");
    statusText.innerText = "Awaiting name input...";
}

// Generate an audible shutter click
function playShutterSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) { console.error(e); }
}

// Visual flash & extract base64 frame from video
function capturePhotoGraphic() {
    const appWrapper = document.querySelector('.camera-bg');
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.backgroundColor = 'white';
    flash.style.zIndex = '9999';
    flash.style.opacity = '1';
    flash.style.transition = 'opacity 0.3s ease-out';
    appWrapper.appendChild(flash);
    
    setTimeout(() => flash.style.opacity = '0', 50);
    setTimeout(() => flash.remove(), 400);

    // Grab the clean video frame
    const capCanvas = document.createElement('canvas');
    capCanvas.width = video.videoWidth;
    capCanvas.height = video.videoHeight;
    capCanvas.getContext('2d').drawImage(video, 0, 0);
    pendingFaceImage = capCanvas.toDataURL('image/png');
}

// Save Name to Device Local Storage (Standard for APK/PWA)
async function savePersonName() {
    const name = personNameInput.value.trim();
    if (!name || !pendingFaceDescriptor) {
        alert("Please enter a valid name.");
        return;
    }
    
    // 1. Update Active Memory
    const arr = Array.from(pendingFaceDescriptor);
    const existingIndex = knownFaces.findIndex(f => f.label === name);
    if (existingIndex >= 0) {
        knownFaces[existingIndex] = new faceapi.LabeledFaceDescriptors(name, [new Float32Array(arr)]);
    } else {
        knownFaces.push(new faceapi.LabeledFaceDescriptors(name, [new Float32Array(arr)]));
    }
    
    // 2. Save to LocalStorage (This persists on the user's phone/browser)
    const currentStorage = JSON.parse(localStorage.getItem('trinetra_faces_v2') || "[]");
    
    // Replace if exists, else add
    const entryIndex = currentStorage.findIndex(s => s.label === name);
    const newEntry = {
        label: name,
        descriptor: arr,
        image: pendingFaceImage // Store the photo as base64 locally
    };

    if (entryIndex >= 0) {
        currentStorage[entryIndex] = newEntry;
    } else {
        currentStorage.push(newEntry);
    }
    
    try {
        localStorage.setItem('trinetra_faces_v2', JSON.stringify(currentStorage));
        console.log(`Successfully saved ${name} to device local storage.`);
    } catch (e) {
        console.error("LocalStorage full? Failed to save locally.", e);
        alert("Device storage is full. Unable to save photo.");
    }

    // 3. Optional: Sync to Backend (Only if node server is reachable)
    try {
        await fetch('/api/save_face', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEntry)
        });
    } catch (e) {
        // Expected fail on mobile APK
    }
    
    closeNameModal();
    speak(`${name} has been memorized successfully.`);
    statusText.innerText = "Scanner Resumed.";
}

function closeNameModal() {
    nameModal.classList.add('hidden');
    pendingFaceDescriptor = null;
    pendingFaceImage = null;
    isCapturingMode = false;
}

// Event Listeners
btnStart.addEventListener('click', startApp);
btnStop.addEventListener('click', stopApp);
btnRemember.addEventListener('click', captureFace);
btnSaveName.addEventListener('click', savePersonName);
btnCancelName.addEventListener('click', closeNameModal);

// FUTURE: Placeholder for depth integration
// function estimateDepth(videoElement) { ... }

window.onload = init;

function playBeep(freq, duration) {
    if (!voiceToggle.checked) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
        
        // Wait for the context to finish before closing
        setTimeout(() => {
            if (audioCtx.state !== 'closed') audioCtx.close();
        }, (duration * 1000) + 500);
    } catch(e) { console.error(e); }
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker failed', err));
    });
}
