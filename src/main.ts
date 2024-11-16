import { invoke } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";

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
  const deleteBtn = document.querySelector("#delete-btn") as HTMLButtonElement;
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
  ) as HTMLButtonElement;
  const username = document.querySelector("#username") as HTMLInputElement;
  const password = document.querySelector("#password") as HTMLInputElement;

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
      const username = document.querySelector("#username") as HTMLInputElement;
      const password = document.querySelector("#password") as HTMLInputElement;
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

// Initialize window
async function initWindow() {
  await Window;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize window
  await initWindow();

  // Get form elements
  const form = document.querySelector("#login-form") as HTMLFormElement;
  const username = document.querySelector("#username") as HTMLInputElement;
  const password = document.querySelector("#password") as HTMLInputElement;
  const deleteBtn = document.querySelector("#delete-btn") as HTMLButtonElement;
  const cancelBtn = document.querySelector("#cancel-btn") as HTMLButtonElement;
  const okBtn = document.querySelector(
    'button[type="submit"]'
  ) as HTMLButtonElement;

  // Set initial button states
  okBtn.disabled = true;
  okBtn.classList.add("opacity-50", "cursor-not-allowed");
  deleteBtn.disabled = true;
  deleteBtn.classList.add("opacity-50", "cursor-not-allowed");

  // Set initial focus
  username.focus();

  // Check for existing credentials
  await checkCredentialsExist();

  // Add input listeners
  username.addEventListener("input", validateForm);
  password.addEventListener("input", validateForm);

  // Handle delete
  deleteBtn.addEventListener("click", async () => {
    try {
      await invoke("delete_credentials");
      username.value = "";
      password.value = "";
      showNotification("Credentials deleted successfully");
      await checkCredentialsExist();
      validateForm();
    } catch (err) {
      showNotification("Failed to delete credentials", true);
      console.error("Error:", err);
    }
  });

  // Handle cancel
  cancelBtn.addEventListener("click", async () => {
    await invoke("quit_app");
  });

  // Handle form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await invoke("save_credentials", {
        credentials: {
          username: username.value,
          password: password.value,
        },
      });
      showNotification("Credentials saved successfully");
      await checkCredentialsExist();
    } catch (err) {
      showNotification("Failed to save credentials", true);
      console.error("Error:", err);
    }
  });
});
