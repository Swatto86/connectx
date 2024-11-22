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

// Declare this once at the top of the file
let searchTimeout: number;

async function handleSearch() {
    const searchInput = document.querySelector("#search-input") as HTMLInputElement;
    const serverList = document.querySelector("#server-list") as HTMLElement;
    
    if (!searchInput || !serverList) return;

    try {
        // If search input is empty, clear the list and show default message
        if (!searchInput.value.trim()) {
            serverList.innerHTML = `
                <div class="text-center text-base-content/60 p-4">
                    Search for servers to connect
                </div>
            `;
            return;
        }

        const results = await invoke<Host[]>("search_hosts", {
            query: searchInput.value
        });

        // Clear existing items
        serverList.innerHTML = "";

        if (results.length === 0) {
            serverList.innerHTML = `
                <div class="text-center text-base-content/60 p-4">
                    No matching hosts found
                </div>
            `;
            return;
        }

        // Add new results
        results.forEach(host => {
            const item = document.createElement("div");
            item.className = "flex items-center justify-between p-4 border-b border-base-300 last:border-b-0";
            
            item.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-medium">${host.hostname}</span>
                    <span class="text-sm opacity-70">${host.ip_address}</span>
                    ${host.description ? `<span class="text-xs opacity-50">${host.description}</span>` : ''}
                </div>
                <button class="connect-btn btn btn-primary btn-sm">
                    Connect
                </button>
            `;

            // Add click handler for the connect button
            const connectBtn = item.querySelector('.connect-btn');
            if (connectBtn) {
                connectBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        await invoke("launch_rdp", { host });
                    } catch (err) {
                        console.error("Failed to connect:", err);
                    }
                });
            }

            serverList.appendChild(item);
        });
    } catch (err) {
        console.error("Search failed:", err);
        serverList.innerHTML = `
            <div class="text-center text-error p-4">
                Failed to search hosts
            </div>
        `;
    }
}

function initializeSearch() {
    const searchInput = document.querySelector("#search-input") as HTMLInputElement;
    
    if (searchInput) {
        // Handle input changes with debounce
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                handleSearch();
            }, 300);
        });
    }
}

function initializeServerList() {
    const serverList = document.querySelector("#server-list") as HTMLElement;
    if (serverList) {
        serverList.innerHTML = `
            <div class="text-center text-base-content/60 p-4">
                Search for servers to connect
            </div>
        `;
    }
}

// Modify the main DOMContentLoaded event listener
document.addEventListener("DOMContentLoaded", () => {
    initializeTheme();
    initializeSearch();
    initializeServerList();
    
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

    // Initialize search functionality
    initializeSearch();

    // Add this for debugging
    console.log("Form found:", form); // Debug log

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            console.log("Form submitted"); // Debug log
            
            const username = (document.querySelector("#username") as HTMLInputElement)?.value;
            const password = (document.querySelector("#password") as HTMLInputElement)?.value;
            
            console.log("Attempting to save credentials:", { username }); // Don't log password
            
            try {
                await invoke("save_credentials", {
                    credentials: { username, password }
                });
                
                console.log("Credentials saved successfully");
                showNotification("Credentials saved successfully");
                
                // Switch to main window
                await invoke("switch_to_main_window");
            } catch (err) {
                console.error("Error saving credentials:", err);
                showNotification("Failed to save credentials", true);
            }
        });
    }

    // Also verify the delete button functionality
    const credentialsDeleteBtn = document.querySelector("#delete-credentials-btn");
    if (credentialsDeleteBtn) {
        credentialsDeleteBtn.addEventListener("click", async () => {
            console.log("Delete button clicked"); // Debug log
            try {
                await invoke("delete_credentials");
                console.log("Credentials deleted successfully");
                
                // Clear form
                (document.querySelector("#username") as HTMLInputElement).value = "";
                (document.querySelector("#password") as HTMLInputElement).value = "";
                
                showNotification("Credentials deleted successfully");
                validateForm(); // Re-validate form after clearing
            } catch (err) {
                console.error("Error deleting credentials:", err);
                showNotification("Failed to delete credentials", true);
            }
        });
    }

    const hostDeleteBtn = document.querySelector("#delete-host-btn");
    if (hostDeleteBtn) {
        hostDeleteBtn.addEventListener("click", async () => {
            // Your host delete logic
        });
    }
});
