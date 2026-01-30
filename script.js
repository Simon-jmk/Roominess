// Global variables
let currentUser = null;
let rooms = [];
let supabaseClient = null;
let currentRoom = null; // Track currently opened room
let qrScanner = null; // QR scanner instance

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

  // Determine redirect URL based on environment
  let redirectUrl;
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    // For localhost dev environment, just use origin
    redirectUrl = window.location.origin;
  } else {
    // For GitHub Pages production (includes repository path)
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
  // Defensive: if DOM isn't ready yet, wait for it and try again
  const loginSection = document.getElementById("login-section");
  const userSection = document.getElementById("user-section");
  const userEmail = document.getElementById("user-email");

  if (!loginSection || !userSection || !userEmail) {
    // DOM not ready — schedule to run once DOMContentLoaded fires
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        // call the same function again after DOM is ready
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

  // Try several possible SVG filenames (spaces vs underscores, with/without ./)
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
        // ignore and try next
      }
    }

    if (!svgText) {
      console.error(
        "❌ Error loading SVG: none of the candidate files were found",
      );
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

  // Remove old rooms
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
    circle.setAttribute("fill", isOccupied ? "#f44336" : "#4caf50");
    circle.setAttribute("stroke", isOccupied ? "#c62828" : "#2e7d32");
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

// Open room modal with info view first
function openRoomModal(room) {
  currentRoom = room;
  const modal = document.getElementById("room-modal");
  document.getElementById("modal-room-name").textContent = room.room_name;
  document.getElementById("modal-room-capacity").textContent =
    `Capacity: ${room.capacity} seats`;

  // Show info view first
  document.getElementById("modal-info-view").style.display = "block";
  document.getElementById("modal-camera-view").style.display = "none";
  document.getElementById("modal-booking-form-view").style.display = "none";

  if (room.current_status === "occupied") {
    document.getElementById("modal-room-status").textContent =
      "Status: Occupied";
    document.getElementById("modal-info-actions").innerHTML =
      '<p style="color: #f44336; font-weight: 500;">This room is currently occupied.</p>';
  } else {
    document.getElementById("modal-room-status").textContent =
      "Status: Available";
    document.getElementById("modal-info-actions").innerHTML =
      `<button class="btn btn-primary" onclick="showCameraView()">📷 Scan QR Code</button>`;
  }

  modal.classList.add("active");
}

// Show camera view
function showCameraView() {
  document.getElementById("modal-info-view").style.display = "none";
  document.getElementById("modal-camera-view").style.display = "block";
  document.getElementById("modal-booking-form-view").style.display = "none";

  // Load QR scanner library if not already loaded
  if (!window.jsQR) {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload = () => startQRScanner();
    document.head.appendChild(script);
  } else {
    startQRScanner();
  }
}

// Start QR scanner
function startQRScanner() {
  const video = document.getElementById("qr-video");
  const canvas = document.getElementById("qr-canvas");

  if (!video || !canvas) {
    console.error("❌ Video or canvas element not found");
    return;
  }

  // Request camera access
  navigator.mediaDevices
    .getUserMedia({
      video: { facingMode: "environment" },
    })
    .then((stream) => {
      video.srcObject = stream;
      video.play();
      scanQRCode(video, canvas, stream);
    })
    .catch((err) => {
      console.error("❌ Camera access denied:", err);
      alert("Camera access is required to scan QR codes");
      showCameraView(); // Stay on camera view but show error
    });
}

// Scan QR code from video stream
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
        console.log("✓ QR Code detected:", code.data);
        scanning = false;

        // Stop the camera stream
        stream.getTracks().forEach((track) => track.stop());

        // Verify QR code matches room
        verifyQRCodeAndShowForm(code.data);
        return;
      }
    }

    requestAnimationFrame(scan);
  };

  scan();

  // Store reference for cleanup
  window.currentQRScanner = {
    scanning: () => scanning,
    stop: () => {
      scanning = false;
    },
  };
}

// Verify QR code matches the room
function verifyQRCodeAndShowForm(qrData) {
  if (!currentRoom) {
    alert("No room selected");
    closeModal();
    return;
  }

  // Debug: log what we're comparing
  console.log("QR scanned:", qrData);
  console.log("Room token:", currentRoom.qr_code_token);
  console.log("Room data:", currentRoom);

  // Check if QR code matches room's QR code from Supabase
  if (currentRoom.qr_code_token === qrData) {
    console.log("✓ QR code matches room:", currentRoom.room_name);
    showBookingForm();
  } else {
    alert("❌ QR code does not match this room. Please try again.");
    showCameraView();
  }
}

// Show booking form
function showBookingForm() {
  document.getElementById("modal-info-view").style.display = "none";
  document.getElementById("modal-camera-view").style.display = "none";
  document.getElementById("modal-booking-form-view").style.display = "block";

  // Reset form
  document.getElementById("booking-group-name").value = "";
  document.getElementById("booking-time").value = "120"; // Default to 2 hours (120 minutes)
  updateTimeDisplay();
}

// Update time display
function updateTimeDisplay() {
  const minutes = parseInt(document.getElementById("booking-time").value);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let timeStr = "";
  if (hours > 0) {
    timeStr += `${hours}h`;
  }
  if (mins > 0) {
    timeStr += ` ${mins}min`;
  }

  document.getElementById("booking-time-display").textContent =
    timeStr || "0 min";
}

// Complete booking
async function completeBooking() {
  const groupName = document.getElementById("booking-group-name").value.trim();
  const time = parseInt(document.getElementById("booking-time").value);

  if (!groupName) {
    alert("Please enter a group name");
    return;
  }

  if (time <= 0 || time > 120) {
    alert("Please select a valid time (1-120 minutes)");
    return;
  }

  if (!currentUser) {
    alert("Not logged in");
    return;
  }

  if (!currentRoom) {
    alert("No room selected");
    return;
  }

  console.log(
    `🔄 Booking room ${currentRoom.room_name} for ${groupName} (${time} minutes)...`,
  );

  const SUPABASE_URL = "https://vbyopcolrvujjvdrkueb.supabase.co";

  // Get the current session token
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    alert("Session expired. Please log in again.");
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
        room_id: currentRoom.id,
        group_name: groupName,
        duration_minutes: time,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Booking error:", result.error);
      alert(result.error || "Booking failed");
      return;
    }

    alert(`✓ Booked! Room reserved for ${groupName} (${time} minutes)`);
    closeModal();
    loadRooms();
  } catch (err) {
    console.error("❌ Booking error:", err);
    alert("Booking failed: " + err.message);
  }
}

// Close modal
function closeModal() {
  const modal = document.getElementById("room-modal");
  const video = document.getElementById("qr-video");

  // Stop camera if running
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }

  modal.classList.remove("active");
  currentRoom = null;
}

// Set up event listeners
function setupEventListeners() {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const modal = document.getElementById("room-modal");
  const timeSlider = document.getElementById("booking-time");

  if (loginBtn) loginBtn.addEventListener("click", loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.id === "room-modal") closeModal();
    });
  }
  if (timeSlider) {
    timeSlider.addEventListener("input", updateTimeDisplay);
  }

  // Setup hamburger menu
  setupHamburgerMenu();
}

// Initialize app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Initializing app...");
    setupEventListeners();
    initSupabase();
  });
} else {
  console.log("🚀 Initializing app...");
  setupEventListeners();
  initSupabase();
}

console.log("✓ Script loaded");
