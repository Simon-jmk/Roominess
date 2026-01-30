// Global variables
let currentUser = null;
let rooms = [];
let supabaseClient = null;
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
  const modal = document.getElementById("room-modal");
  const statusIcon = document.getElementById("modal-status-icon");
  
  // Set room name
  document.getElementById("modal-room-name").textContent = room.room_name;
  
  // Set capacity info
  document.getElementById("modal-room-capacity").textContent = 
    `Total capacity: ${room.capacity} seats`;
  
  // Calculate occupancy (simplified - you might want to get real data from your API)
  const occupiedSeats = room.current_status === "occupied" ? Math.floor(room.capacity * 0.7) : 0;
  document.getElementById("modal-occupancy-info").textContent = 
    `Currently occupied: ${occupiedSeats}/${room.capacity} seats`;

  if (room.current_status === "occupied") {
    // Set status with icon
    document.getElementById("modal-status-text").textContent = "Occupied";
    statusIcon.className = "legend-color occupied";
    
    document.getElementById("modal-actions").innerHTML =
      '<p style="color: #f44336; font-weight: 500;">This room is currently occupied.</p>';
  } else {
    // Set status with icon
    document.getElementById("modal-status-text").textContent = "Available";
    statusIcon.className = "legend-color available";
    
    document.getElementById("modal-actions").innerHTML =
      `<button class="btn btn-primary" onclick="showCheckInForm('${room.id}')">Check In (2 hours)</button>`;
  }

  modal.classList.add("active");
}

// Show check-in form
function showCheckInForm(roomId) {
  const extraContent = document.getElementById('extra-content');
  const modalActions = document.getElementById('modal-actions');
  
  // Find the room to get its capacity
  const room = rooms.find(r => r.id === roomId);
  const capacity = room ? room.capacity : 10; // fallback to 10 if not found
  
  // Generate options for seats dropdown
  let seatOptions = '';
  for (let i = 1; i <= capacity; i++) {
    seatOptions += `<option value="${i}">${i}</option>`;
  }
  
  if (extraContent) {
    extraContent.innerHTML = `
      <div class="checkin-form">
        <div class="form-group">
          <label for="group-name">Group Name:</label>
          <input type="text" id="group-name" placeholder="Enter group name" />
        </div>
        <div class="form-group">
          <label for="seats-needed">Seats:</label>
          <select id="seats-needed" required>
            <option value="">Select number of seats</option>
            ${seatOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="mood">Mood:</label>
          <select id="mood" required>
            <option value="">Select mood</option>
            <option value="focused">Do not disturb</option>
            <option value="collaborative">Dont mind company!</option>
            <option value="relaxed">Join, but shhhh</option>
          </select>
        </div>
        <div class="form-buttons">
          <button class="btn btn-primary" onclick="confirmCheckIn('${roomId}')">Check In (2 hours)</button>
          <button class="btn btn-secondary" onclick="cancelCheckIn('${roomId}')">Cancel</button>
        </div>
      </div>
    `;
  }
  
  // Hide the big check-in button
  if (modalActions) {
    modalActions.style.display = 'none';
  }
}

// Cancel check-in form
function cancelCheckIn(roomId) {
  const extraContent = document.getElementById('extra-content');
  const modalActions = document.getElementById('modal-actions');
  
  if (extraContent) {
    extraContent.innerHTML = '<!-- Future features can go here -->';
  }
  
  // Show the big check-in button again
  if (modalActions) {
    modalActions.style.display = 'block';
  }
}

// Confirm check-in with form data
async function confirmCheckIn(roomId) {
  const groupName = document.getElementById('group-name').value.trim();
  const seatsNeeded = document.getElementById('seats-needed').value;
  
  if (!groupName) {
    alert('Please enter a group name');
    return;
  }
  
  if (!seatsNeeded || seatsNeeded === '') {
    alert('Please select number of seats needed');
    return;
  }
  
  console.log(`🔄 Checking in room ${roomId} for group "${groupName}" with ${seatsNeeded} seats`);
  
  // Call the original check-in function
  await checkIntoRoom(roomId, groupName, seatsNeeded);
}

// Close modal
function closeModal() {
  document.getElementById("room-modal").classList.remove("active");
}

// Check into a room (via Edge Function - restricted to school WiFi + JWT)
async function checkIntoRoom(roomId, groupName = null, seatsNeeded = null) {
  if (!currentUser) {
    alert("Not logged in");
    return;
  }

  console.log("🔄 Checking into room:", roomId, groupName ? `for group "${groupName}"` : '', seatsNeeded ? `with ${seatsNeeded} seats` : '');

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
        room_id: roomId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Check-in error:", result.error);
      alert(result.error || "Check-in failed");
      return;
    }

    alert("✓ Checked in! You have the room for 2 hours.");
    closeModal();
    loadRooms();
  } catch (err) {
    console.error("❌ Check-in error:", err);
    alert("Check-in failed: " + err.message);
  }
}

// Update booking timer
function updateBookingTimer() {
  const timerElement = document.getElementById('booking-timer');
  if (!timerElement) return;

  // Find any booked rooms with current user
  const bookedRoom = rooms.find(room => 
    room.current_status === 'occupied' && 
    room.booked_by_user_id === (currentUser ? currentUser.id : null)
  );

  if (bookedRoom && bookedRoom.booking_end_time) {
    const endTime = new Date(bookedRoom.booking_end_time);
    const now = new Date();
    const timeLeft = endTime - now;

    if (timeLeft > 0) {
      const minutes = Math.floor(timeLeft / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      
      timerElement.textContent = hours > 0 ? 
        `${hours}:${mins.toString().padStart(2, '0')}` : 
        `${mins}min`;
      timerElement.style.color = timeLeft < 15 * 60 * 1000 ? '#d9534f' : '#f0ad4e'; // Red if < 15min
    } else {
      timerElement.textContent = 'Expired';
      timerElement.style.color = '#d9534f';
    }
  } else {
    timerElement.textContent = '--:--';
    timerElement.style.color = '#f0ad4e';
  }
}

// Start booking timer interval
function startBookingTimerInterval() {
  if (bookingTimerInterval) {
    clearInterval(bookingTimerInterval);
  }
  bookingTimerInterval = setInterval(updateBookingTimer, 30000); // Update every 30 seconds
}

// Set up event listeners
function setupEventListeners() {
  const loginBtn = document.getElementById("login-btn");
  const modal = document.getElementById("room-modal");

  if (loginBtn) loginBtn.addEventListener("click", loginWithGoogle);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.id === "room-modal") closeModal();
    });
  }

  // Setup logout link in navigation
  document.querySelectorAll('a[href="#logout"]').forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  });

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
