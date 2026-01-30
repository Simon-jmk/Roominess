// Global variables
let currentUser = null;
let rooms = [];
let supabaseClient = null;

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

// Login with Google
async function loginWithGoogle() {
  console.log("🔄 Logging in with Google...");
  if (!supabaseClient) {
    alert("App not ready. Please refresh.");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: { hd: "chasacademy.se" },
      redirectTo: window.location.origin,
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

// Open room modal
function openRoomModal(room) {
  const modal = document.getElementById("room-modal");
  document.getElementById("modal-room-name").textContent = room.room_name;
  document.getElementById("modal-room-capacity").textContent =
    `Capacity: ${room.capacity} seats`;

  if (room.current_status === "occupied") {
    document.getElementById("modal-room-status").textContent =
      "Status: Occupied";
    document.getElementById("modal-actions").innerHTML =
      '<p style="color: #f44336; font-weight: 500;">This room is currently occupied.</p>';
  } else {
    document.getElementById("modal-room-status").textContent =
      "Status: Available";
    document.getElementById("modal-actions").innerHTML =
      `<button class="btn btn-primary" onclick="checkIntoRoom('${room.id}')">Check In (2 hours)</button>`;
  }

  modal.classList.add("active");
}

// Close modal
function closeModal() {
  document.getElementById("room-modal").classList.remove("active");
}

// Check into a room
async function checkIntoRoom(roomId) {
  if (!currentUser) {
    alert("Not logged in");
    return;
  }

  console.log("🔄 Checking into room:", roomId);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 2);

  const { error } = await supabaseClient.from("occupancies").insert({
    room_id: roomId,
    user_id: currentUser.id,
    expires_at: expiresAt.toISOString(),
    status: "active",
  });

  if (error) {
    console.error("❌ Check-in error:", error);
    alert("Check-in failed: " + error.message);
    return;
  }

  alert("✓ Checked in! You have the room for 2 hours.");
  closeModal();
  loadRooms();
}

// Set up event listeners
function setupEventListeners() {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const modal = document.getElementById("room-modal");

  if (loginBtn) loginBtn.addEventListener("click", loginWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.id === "room-modal") closeModal();
    });
  }
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
