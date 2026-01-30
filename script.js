// Global variables
let currentUser = null;
let rooms = [];
let supabaseClient = null;
let currentRoom = null;
let bookingTimerInterval = null;

// Initialize Supabase when page loads
function initSupabase() {
  if (!window.supabase) {
    console.error("❌ Supabase library not loaded");
    setTimeout(initSupabase, 100);
    return;
  }

  const SUPABASE_URL = "https://vbyopcolrvujjvdrkueb.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZieW9wY29scnZ1amp2ZHJrdWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTYyNDQsImV4cCI6MjA4NTI3MjI0NH0.zv5mNlYwABz_UWO5P5Gf8a5pAUt9JKueLg017Gc59RE";

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
  console.log("✓ Supabase initialized");

  setupAuthListeners();
  checkUserSession();
}

// Listen for auth state changes
function setupAuthListeners() {
  if (!supabaseClient) return;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth event:", event);
    if (event === "SIGNED_IN" && session && session.user) {
      currentUser = session.user;
      showUserSection();
    }
  });
}

// Hamburger
function setupHamburgerMenu() {
  const hamburger = document.querySelector(".hamburger");
  const navMenu = document.querySelector(".nav-menu");

  if (!hamburger || !navMenu) {
    console.error("❌ Hamburger or nav menu not found");
    return;
  }

  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
  });

  document.querySelectorAll(".nav-menu li a").forEach((n) =>
    n.addEventListener("click", () => {
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    }),
  );
}

// Login with Google
async function loginWithGoogle() {
  console.log("🔄 Logging in with Google...");
  if (!supabaseClient) {
    alert("App not ready. Please refresh.");
    return;
  }

  let redirectUrl;
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    redirectUrl = window.location.origin;
  } else {
    redirectUrl = window.location.origin + window.location.pathname;
  }

  console.log("🔄 Redirect URL:", redirectUrl);

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: { hd: "chasacademy.se" },
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    console.error("❌ Login error:", error);
    alert("Login failed: " + error.message);
  }
}

// Logout
async function logout() {
  console.log("🔄 Logging out...");
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  if (bookingTimerInterval) {
    clearInterval(bookingTimerInterval);
    bookingTimerInterval = null;
  }
  const loginSection = document.getElementById("login-section");
  const userSection = document.getElementById("user-section");
  if (loginSection) loginSection.style.display = "block";
  if (userSection) userSection.style.display = "none";
}

// Check if user is already logged in
async function checkUserSession() {
  if (!supabaseClient) return;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    showUserSection();
  }
}

// Show the main app after login
function showUserSection() {
  const loginSection = document.getElementById("login-section");
  const userSection = document.getElementById("user-section");
  const userEmail = document.getElementById("user-email");

  if (!loginSection || !userSection || !userEmail) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        showUserSection();
      },
      { once: true },
    );
    return;
  }

  loginSection.style.display = "none";
  userSection.style.display = "flex";
  if (currentUser && currentUser.email)
    userEmail.textContent = currentUser.email;
  loadRooms();
  startBookingTimerInterval();
}

// Load rooms from database
async function loadRooms() {
  console.log("🔄 Loading rooms...");
  if (!supabaseClient) return;

  const loading = document.getElementById("loading");
  if (loading) {
    loading.style.display = "block";
  }

  const { data, error } = await supabaseClient.from("room_status").select("*");

  if (error) {
    console.error("❌ Error loading rooms:", error);
    if (loading) {
      loading.innerHTML = "Error: " + error.message;
    }
    return;
  }

  rooms = data || [];
  console.log("✓ Loaded " + rooms.length + " rooms");
  renderMap();
  subscribeToRoomChanges();
  updateBookingTimer();
}

// Render the SVG floor plan
function renderMap() {
  const floorPlan = document.getElementById("floor-plan");
  const loading = document.getElementById("loading");

  if (!floorPlan) {
    console.error("❌ floor-plan element not found");
    return;
  }

  if (loading) {
    loading.style.display = "none";
  }

  if (!rooms || rooms.length === 0) {
    floorPlan.innerHTML =
      '<p style="padding: 20px; text-align: center;">No rooms found.</p>';
    return;
  }

  floorPlan.innerHTML = "";

  (async () => {
    const candidates = [
      "map.svg",
      "./map.svg",
      "Group 3.svg",
      "Group_3.svg",
      "./Group 3.svg",
      "./Group_3.svg",
    ];
    let svgText = null;
    for (const path of candidates) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          svgText = await res.text();
          break;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!svgText) {
      console.error("❌ Error loading SVG");
      floorPlan.innerHTML =
        '<p style="padding: 20px; text-align: center;">Error loading floor plan.</p>';
      return;
    }

    const svgWrapper = document.createElement("div");
    svgWrapper.id = "svg-wrapper";
    svgWrapper.innerHTML = svgText;
    floorPlan.appendChild(svgWrapper);

    const svgElement = svgWrapper.querySelector("svg");
    if (svgElement) {
      if (!svgElement.getAttribute("viewBox")) {
        const width = svgElement.getAttribute("width") || "725";
        const height = svgElement.getAttribute("height") || "970";
        svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
      svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    renderRooms();
  })();
}

// Add room circles to the SVG
function renderRooms() {
  const floorPlan = document.getElementById("floor-plan");
  const svgElement = floorPlan.querySelector("svg");

  if (!svgElement) return;

  svgElement.querySelectorAll(".room-group").forEach((el) => el.remove());

  let parentElement = svgElement;
  const children = Array.from(svgElement.children);
  const contentGroup = children.find(
    (child) =>
      child.tagName === "g" &&
      (child.getAttribute("transform") || child.children.length > 0),
  );
  if (contentGroup) {
    parentElement = contentGroup;
  }

  rooms.forEach((room) => {
    const shortName = getShortRoomName(room.room_name);
    const isOccupied = room.current_status === "occupied";

    const roomGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    roomGroup.setAttribute("class", "room-group");
    roomGroup.setAttribute("data-room-id", room.id);
    roomGroup.style.cursor = "pointer";
    roomGroup.addEventListener("click", () => openRoomModal(room));

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", room.coordinates_x);
    circle.setAttribute("cy", room.coordinates_y);
    circle.setAttribute("r", "25");
    circle.setAttribute("fill", isOccupied ? "#5c5757" : "#5fb3c7");
    circle.setAttribute("stroke", isOccupied ? "#3b3838" : "#3f94a9");
    circle.setAttribute("stroke-width", "2");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", room.coordinates_x);
    text.setAttribute("y", room.coordinates_y + 5);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "white");
    text.setAttribute("font-size", "14");
    text.setAttribute("font-weight", "bold");
    text.textContent = shortName;

    roomGroup.appendChild(circle);
    roomGroup.appendChild(text);
    parentElement.appendChild(roomGroup);
  });
}

// Get short room name
function getShortRoomName(roomName) {
  if (roomName.match(/aw/i)) return "AW";
  const match = roomName.match(/([A-Za-z])(\d+)/);
  if (match) return match[1].toUpperCase() + match[2];
  return roomName.substring(0, 3).toUpperCase();
}

// Subscribe to room changes
function subscribeToRoomChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("room-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "occupancies" },
      () => {
        loadRooms();
      },
    )
    .subscribe();
}

// Open room modal
function openRoomModal(room) {
  console.log("📍 Opening modal for:", room.room_name);
  currentRoom = room;
  const modal = document.getElementById("room-modal");

  if (!modal) {
    console.error("❌ Modal element not found!");
    return;
  }

  // Room name
  const roomNameEl = document.getElementById("modal-room-name");
  if (roomNameEl) roomNameEl.textContent = room.room_name;

  // Status icon
  const statusIcon = document.getElementById("modal-status-icon");
  const statusText = document.getElementById("modal-status-text");

  if (statusIcon && statusText) {
    if (room.current_status === "occupied") {
      statusIcon.className = "legend-color occupied";
      statusText.textContent = "Occupied";
    } else {
      statusIcon.className = "legend-color available";
      statusText.textContent = "Available";
    }
  }

  // Capacity
  const capacityEl = document.getElementById("modal-room-capacity");
  if (capacityEl)
    capacityEl.textContent = `Total capacity: ${room.capacity} seats`;

  // Occupancy
  const occupancyEl = document.getElementById("modal-occupancy-info");
  if (occupancyEl) {
    const occupiedSeats =
      room.current_status === "occupied" ? Math.floor(room.capacity * 0.7) : 0;
    occupancyEl.textContent = `Currently occupied: ${occupiedSeats}/${room.capacity} seats`;
  }

  // Clear extra content
  const extraContent = document.getElementById("extra-content");
  if (extraContent) {
    extraContent.innerHTML = "";
  }

  // Modal actions
  const modalActions = document.getElementById("modal-actions");
  if (modalActions) {
    if (room.current_status === "occupied") {
      modalActions.innerHTML =
        '<p style="color: #5c5757; font-weight: 500;">This room is currently occupied.</p>';
    } else {
      modalActions.innerHTML = `<button class="btn btn-primary" onclick="showCameraView()">📷 Scan QR Code</button>`;
    }
  }

  modal.classList.add("active");
}

// Show camera view
function showCameraView() {
  console.log("📷 Opening camera...");
  const extraContent = document.getElementById("extra-content");
  const modalActions = document.getElementById("modal-actions");

  if (!extraContent) {
    console.error("❌ extra-content not found");
    return;
  }

  extraContent.innerHTML = `
    <div class="camera-view">
      <h3>📷 Scan QR Code</h3>
      <p>Point your camera at the QR code on the room</p>
      <div class="qr-scanner-container">
        <video id="qr-video" class="qr-video" playsinline></video>
        <canvas id="qr-canvas" style="display: none;"></canvas>
        <div class="qr-scanner-frame"></div>
      </div>
      <p style="text-align: center; margin-top: 15px; font-size: 13px; color: #999;">
        Camera will automatically detect the QR code
      </p>
      <button class="btn btn-secondary" onclick="closeCameraView()" style="width: 100%; margin-top: 10px;">Cancel</button>
    </div>
  `;

  if (modalActions) {
    modalActions.style.display = "none";
  }

  // Load jsQR
  if (!window.jsQR) {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload = () => startQRScanner();
    document.head.appendChild(script);
  } else {
    startQRScanner();
  }
}

// Close camera view
function closeCameraView() {
  console.log("❌ Closing camera");
  const video = document.getElementById("qr-video");

  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }

  const extraContent = document.getElementById("extra-content");
  if (extraContent) {
    extraContent.innerHTML = "";
  }

  const modalActions = document.getElementById("modal-actions");
  if (modalActions) {
    modalActions.style.display = "block";
  }
}

// Start QR scanner
function startQRScanner() {
  const video = document.getElementById("qr-video");
  const canvas = document.getElementById("qr-canvas");

  if (!video || !canvas) {
    console.error("❌ Video/canvas not found");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "environment" } })
    .then((stream) => {
      console.log("✓ Camera access OK");
      video.srcObject = stream;
      video.play();
      scanQRCode(video, canvas, stream);
    })
    .catch((err) => {
      console.error("❌ Camera denied:", err);
      alert("Camera access required");
      closeCameraView();
    });
}

// Scan QR code
function scanQRCode(video, canvas, stream) {
  const ctx = canvas.getContext("2d");
  let scanning = true;

  const scan = () => {
    if (!scanning) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
      );

      if (code) {
        console.log("✓ QR detected:", code.data);
        scanning = false;
        stream.getTracks().forEach((track) => track.stop());
        verifyQRCodeAndShowForm(code.data);
        return;
      }
    }

    requestAnimationFrame(scan);
  };

  scan();
}

// Verify QR code
function verifyQRCodeAndShowForm(qrData) {
  if (!currentRoom) {
    alert("No room selected");
    closeModal();
    return;
  }

  console.log("📋 QR Verification:");
  console.log("  Scanned QR:", qrData);
  console.log("  Room QR Code Token:", currentRoom.qr_code_token);
  console.log("  Room Name:", currentRoom.room_name);

  if (currentRoom.qr_code_token === qrData) {
    console.log("✓ QR matches room");
    showBookingForm();
  } else {
    console.log("❌ QR mismatch - codes don't match");
    alert("❌ Wrong QR code. Try again.");
    closeCameraView();
  }
}

// Show booking form
function showBookingForm() {
  const extraContent = document.getElementById("extra-content");
  const modalActions = document.getElementById("modal-actions");

  if (!extraContent) {
    console.error("❌ extra-content not found");
    return;
  }

  const capacity = currentRoom.capacity;
  let seatOptions = "";
  for (let i = 1; i <= capacity; i++) {
    seatOptions += `<option value="${i}">${i}</option>`;
  }

  extraContent.innerHTML = `
    <div class="checkin-form">
      <div class="form-group">
        <label for="group-name">Group Name:</label>
        <input type="text" id="group-name" placeholder="Enter group name" />
      </div>
      <div class="form-group">
        <label for="seats-needed">Seats:</label>
        <select id="seats-needed">
          <option value="">Select number of seats</option>
          ${seatOptions}
        </select>
      </div>
      <div class="form-buttons">
        <button class="btn btn-primary" onclick="confirmCheckIn()">Check In (2 hours)</button>
        <button class="btn btn-secondary" onclick="showCameraView()">↶ Scan Again</button>
      </div>
    </div>
  `;

  if (modalActions) {
    modalActions.style.display = "none";
  }
}

// Confirm check-in
async function confirmCheckIn() {
  const groupName = document.getElementById("group-name").value.trim();
  const seatsNeeded = document.getElementById("seats-needed").value;

  if (!groupName) {
    alert("Enter group name");
    return;
  }

  if (!seatsNeeded) {
    alert("Select number of seats");
    return;
  }

  console.log(`✓ Checking in: ${groupName}, ${seatsNeeded} seats`);
  await checkIntoRoom(currentRoom.id, groupName, seatsNeeded);
}

// Close modal
function closeModal() {
  const modal = document.getElementById("room-modal");
  const video = document.getElementById("qr-video");

  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }

  if (modal) {
    modal.classList.remove("active");
  }
  currentRoom = null;
}

// Check into room
async function checkIntoRoom(roomId, groupName, seatsNeeded) {
  if (!currentUser) {
    alert("Not logged in");
    return;
  }

  const SUPABASE_URL = "https://vbyopcolrvujjvdrkueb.supabase.co";

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    alert("Session expired");
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        room_id: roomId,
        group_name: groupName,
        seats_needed: seatsNeeded,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || "Check-in failed");
      return;
    }

    alert("✓ Checked in! 2 hours booked.");
    closeModal();
    loadRooms();
  } catch (err) {
    console.error("❌ Error:", err);
    alert("Check-in failed");
  }
}

// Update booking timer
function updateBookingTimer() {
  const timerEl = document.getElementById("booking-timer");
  if (!timerEl) return;

  const bookedRoom = rooms.find(
    (r) =>
      r.current_status === "occupied" &&
      r.booked_by_user_id === (currentUser ? currentUser.id : null),
  );

  if (bookedRoom && bookedRoom.booking_end_time) {
    const timeLeft = new Date(bookedRoom.booking_end_time) - new Date();

    if (timeLeft > 0) {
      const mins = Math.floor(timeLeft / (1000 * 60));
      const hrs = Math.floor(mins / 60);
      const min = mins % 60;

      timerEl.textContent =
        hrs > 0 ? `${hrs}:${min.toString().padStart(2, "0")}` : `${min}min`;
      timerEl.style.color = timeLeft < 15 * 60 * 1000 ? "#d9534f" : "#f0ad4e";
    } else {
      timerEl.textContent = "Expired";
      timerEl.style.color = "#d9534f";
    }
  } else {
    timerEl.textContent = "--:--";
    timerEl.style.color = "#f0ad4e";
  }
}

// Start timer
function startBookingTimerInterval() {
  if (bookingTimerInterval) clearInterval(bookingTimerInterval);
  bookingTimerInterval = setInterval(updateBookingTimer, 30000);
}

// Setup listeners
function setupEventListeners() {
  const loginBtn = document.getElementById("login-btn");
  const modal = document.getElementById("room-modal");

  if (loginBtn) {
    loginBtn.addEventListener("click", loginWithGoogle);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.id === "room-modal") closeModal();
    });
  }

  document.querySelectorAll('a[href="#logout"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  });

  setupHamburgerMenu();
  console.log("✓ Listeners ready");
}

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Initializing...");
    setupEventListeners();
    initSupabase();
  });
} else {
  console.log("🚀 Initializing...");
  setupEventListeners();
  initSupabase();
}

console.log("✓ Script loaded");
