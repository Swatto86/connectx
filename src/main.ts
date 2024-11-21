import { invoke } from "@tauri-apps/api/core";

interface StoredCredentials {
  username: string;
  password: string;
}

interface Host {
    hostname: string;
    ip_address: string;
    description: string;
}

function showNotification(message: string, isError: boolean = false) {
  const notification = document.createElement("div");
  notification.className = `
        fixed bottom-2 left-1/2 transform -translate-x-1/2
        ${isError ? "bg-red-500" : "bg-green-500"}
        text-white px-4 py-2 rounded-md shadow-lg
        text-center min-w-[200px] whitespace-nowrap
        text-sm
    `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 1000);
}

// Function to update button states
function updateButtonStates(hasCredentials: boolean) {
  const deleteBtn = document.querySelector(
    "#delete-btn"
  ) as HTMLButtonElement | null;
  if (deleteBtn) {
    deleteBtn.disabled = !hasCredentials;
    deleteBtn.classList.toggle("opacity-50", !hasCredentials);
    deleteBtn.classList.toggle("cursor-not-allowed", !hasCredentials);
  }
}

// Function to validate form
function validateForm() {
  const okBtn = document.querySelector(
    'button[type="submit"]'
  ) as HTMLButtonElement | null;
  const username = document.querySelector(
    "#username"
  ) as HTMLInputElement | null;
  const password = document.querySelector(
    "#password"
  ) as HTMLInputElement | null;

  if (okBtn && username && password) {
    const isValid =
      username.value.trim() !== "" && password.value.trim() !== "";
    okBtn.disabled = !isValid;
    okBtn.classList.toggle("opacity-50", !isValid);
    okBtn.classList.toggle("cursor-not-allowed", !isValid);
  }
}

// Check credentials existence
async function checkCredentialsExist() {
  try {
    const stored = await invoke<StoredCredentials>("get_stored_credentials");
    updateButtonStates(!!stored);

    // If credentials exist, populate the form
    if (stored) {
      const username = document.querySelector(
        "#username"
      ) as HTMLInputElement | null;
      const password = document.querySelector(
        "#password"
      ) as HTMLInputElement | null;
      if (username && password) {
        username.value = stored.username;
        password.value = stored.password;
        validateForm();
      }
    }
  } catch (err) {
    console.error("Error checking credentials:", err);
    updateButtonStates(false);
  }
}

// Declare the function as a global
declare global {
  interface Window {
    toggleTheme: (themeName: string) => void;
  }
}

// Assign the function to window object
window.toggleTheme = function(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('theme', themeName);
};

function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dracula';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Add click handlers for theme menu items
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const themeValue = target.getAttribute('data-theme-value');
    
    if (themeValue) {
      document.documentElement.setAttribute('data-theme', themeValue);
      localStorage.setItem('theme', themeValue);
      
      // Find and close the dropdown by removing focus
      const dropdownContent = target.closest('.dropdown-content');
      if (dropdownContent) {
        (dropdownContent as HTMLElement).blur();
        // Also blur the parent dropdown
        const dropdown = dropdownContent.parentElement;
        if (dropdown) {
          dropdown.blur();
        }
      }
    }
  });
}

// Initialize theme when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  // Get form elements
  const form = document.querySelector("#login-form") as HTMLFormElement | null;
  const username = document.querySelector(
    "#username"
  ) as HTMLInputElement | null;
  const password = document.querySelector(
    "#password"
  ) as HTMLInputElement | null;
  const deleteBtn = document.querySelector(
    "#delete-btn"
  ) as HTMLButtonElement | null;
  const cancelBtn = document.querySelector(
    "#cancel-btn"
  ) as HTMLButtonElement | null;
  const okBtn = document.querySelector(
    'button[type="submit"]'
  ) as HTMLButtonElement | null;

  // Set initial button states
  if (okBtn) {
    okBtn.disabled = true;
    okBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.classList.add("opacity-50", "cursor-not-allowed");
  }

  // Set initial focus
  if (username) {
    username.focus();
  }

  // Check for existing credentials
  checkCredentialsExist();

  // Add input listeners
  if (username) {
    username.addEventListener("input", validateForm);
  }
  if (password) {
    password.addEventListener("input", validateForm);
  }

  // Handle delete
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      try {
        await invoke("delete_credentials");
        if (username) username.value = "";
        if (password) password.value = "";
        showNotification("Credentials deleted successfully");
        checkCredentialsExist();
        validateForm();
      } catch (err) {
        showNotification("Failed to delete credentials", true);
        console.error("Error:", err);
      }
    });
  }

  // Handle cancel
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      await invoke("quit_app");
    });
  }

  // Handle form submit
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await invoke("save_credentials", {
          credentials: {
            username: username?.value,
            password: password?.value,
          },
        });
        
        // Show success notification immediately after saving
        showNotification("Credentials saved successfully");
        
        // Enable delete button after successful save
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
        
        // Switch windows after a short delay to ensure notification is seen
        setTimeout(async () => {
          await invoke("switch_to_main_window");
        }, 500);
        
      } catch (err) {
        showNotification("Failed to save credentials", true);
        console.error("Error:", err);
      }
    });
  }

  // Add this to your initialization code
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
      // Update theme when it's changed in another window
      const newTheme = e.newValue || 'dracula';
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  });

  // Modify the back button handler to properly switch windows
  const backToLogin = document.querySelector("#backToLogin");
  if (backToLogin) {
    backToLogin.addEventListener("click", async () => {
      try {
        // First show login window, then hide main window
        await invoke("show_login_window");
        await invoke("hide_main_window");
      } catch (err) {
        console.error("Error switching windows:", err);
      }
    });
  }

  // Update the manage hosts event listener
  document.getElementById("manageHosts")?.addEventListener("click", async () => {
    try {
      await invoke("show_hosts_window");
    } catch (err) {
      console.error("Error showing hosts window:", err);
    }
  });

  const searchInput = document.getElementById("serverSearch") as HTMLInputElement;
  const searchButton = document.getElementById("searchButton");
  const serverList = document.querySelector(".bg-base-200") as HTMLElement;

  let searchTimeout: number;

  async function performSearch() {
    try {
      const query = searchInput.value;
      const results = await invoke<Host[]>("search_hosts", { query });
      renderSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
    }
  }

  function renderSearchResults(hosts: Host[]) {
    if (hosts.length === 0) {
      serverList.innerHTML = `
        <p class="text-center text-base-content/60 py-4">
          No matching hosts found
        </p>
      `;
      return;
    }

    serverList.innerHTML = `
      <div class="overflow-x-auto">
        <table class="table w-full">
          <thead>
            <tr>
              <th class="text-center">Hostname</th>
              <th class="text-center">IP Address</th>
              <th class="text-center">Description</th>
            </tr>
          </thead>
          <tbody>
            ${hosts.map(host => `
              <tr class="hover:bg-base-300 cursor-pointer" data-host='${JSON.stringify(host)}'>
                <td class="text-center">${host.hostname}</td>
                <td class="text-center">${host.ip_address}</td>
                <td class="text-center">${host.description}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    // Add double-click handlers
    const rows = serverList.querySelectorAll("tr[data-host]");
    rows.forEach(row => {
      row.addEventListener("dblclick", async () => {
        const host = JSON.parse((row as HTMLElement).dataset.host!);
        try {
          await invoke("launch_rdp", { host });
        } catch (error) {
          console.error("Failed to launch RDP:", error);
        }
      });
    });
  }

  // Search input handler with debounce
  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(performSearch, 300);
  });

  // Search button handler
  searchButton?.addEventListener("click", () => {
    window.clearTimeout(searchTimeout);
    performSearch();
  });

  // Initial search to show all hosts
  performSearch();
});
