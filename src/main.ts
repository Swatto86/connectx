import { invoke } from "@tauri-apps/api/core";

interface StoredCredentials {
  username: string;
  password: string;
}

function showNotification(message: string, isError: boolean = false) {
  const notification = document.createElement("div");
  notification.className = `
        fixed bottom-4 left-1/2 transform -translate-x-1/2
        ${isError ? "bg-red-500" : "bg-green-500"}
        text-white px-4 py-2 rounded-md shadow-lg
        text-center min-w-[200px]
    `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
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
        
        // Create and show main application window
        await invoke("show_main_window");
        
        // Close the login window
        await invoke("close_login_window");
      } catch (err) {
        showNotification("Failed to save credentials", true);
        console.error("Error:", err);
      }
    });
  }
});
