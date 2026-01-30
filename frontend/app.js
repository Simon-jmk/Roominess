const BACKEND_URL = "http://10.100.3.138:4000"; // YOUR IP!

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const scannedIdEl = document.getElementById("scanned-id");
const statusValueEl = document.getElementById("status-value");
const statusMessageEl = document.getElementById("status-message");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");

let stream = null;
let scanning = false;
let rafId = null;

function setStatus(status, message) {
  statusValueEl.textContent = status;
  statusMessageEl.textContent = message || "";
}

function setScannedId(id) {
  scannedIdEl.textContent = id || "--";
}

async function confirmQrId(qrText) {
  try {
    setStatus("authenticating", "Verifying ID...");
    
    const res = await fetch(`${BACKEND_URL}/qr/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: qrText }),
    });
    
    const data = await res.json();
    
    if (data.status === "approved") {
      setStatus("approved", `✅ Authenticated: ${data.userId}`);
    } else {
      setStatus("error", "ID invalid/expired");
    }
  } catch (err) {
    setStatus("error", "Network error");
    console.error(err);
  }
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: "environment", 
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    
    video.srcObject = stream;
    video.play();
    
    scanning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    setStatus("scanning", "Point at QR code");
    scanLoop();
    
  } catch (err) {
    console.error("Camera error:", err);
    setStatus("error", `Camera denied: ${err.name}`);
    startBtn.disabled = false;
  }
}

function stopCamera() {
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  video.srcObject = null;
  video.pause();
  
  startBtn.disabled = false;
  stopBtn.disabled = true;
  
  setStatus("stopped", "Camera stopped");
}

function scanLoop() {
  if (!scanning || video.readyState !== video.HAVE_ENOUGH_DATA) {
    rafId = requestAnimationFrame(scanLoop);
    return;
  }
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  
  if (code) {
    console.log("✅ QR found:", code.data);
    setScannedId(code.data);
    stopCamera();
    confirmQrId(code.data);
    return;
  }
  
  rafId = requestAnimationFrame(scanLoop);
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);

setStatus("ready", "Tap to start scanning");
