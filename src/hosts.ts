import { invoke } from "@tauri-apps/api/core";

interface Host {
  hostname: string;
  description: string;
}

let hosts: Host[] = [];

document.addEventListener("DOMContentLoaded", () => {
  loadHosts();
  setupEventListeners();
  window.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      try {
        await invoke("hide_hosts_window");
      } catch (err) {
        console.error("Error hiding hosts window:", err);
      }
    }
  });
});

function setupEventListeners() {
  document.getElementById("addHost")?.addEventListener("click", () => {
    const modal = document.getElementById("hostModal") as HTMLDialogElement;
    document.getElementById("modalTitle")!.textContent = "Add Host";
    const form = document.getElementById("hostForm") as HTMLFormElement;
    form.reset();
    modal.showModal();
  });

  document.getElementById("hostForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const hostnameInput = document.getElementById("hostname") as HTMLInputElement;
    const email = hostnameInput.value.trim();
    
    if (!isValidEmail(email)) {
      alert("Please enter a valid connection string in the format: server@domain.com");
      return;
    }
    
    const host: Host = {
      hostname: email,
      description: (document.getElementById("description") as HTMLTextAreaElement).value,
    };
    
    try {
      await saveHost(host);
      (document.getElementById("hostModal") as HTMLDialogElement).close();
    } catch (error) {
      console.error("Failed to save host:", error);
    }
  });

  document.getElementById("backToMain")?.addEventListener("click", async () => {
    try {
      await invoke("hide_hosts_window");
    } catch (err) {
      console.error("Error hiding hosts window:", err);
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const themeValue = target.getAttribute('data-theme-value');
    
    if (themeValue) {
      document.documentElement.setAttribute('data-theme', themeValue);
      localStorage.setItem('theme', themeValue);
      
      // Close the dropdown
      const dropdownContent = target.closest('.dropdown-content');
      if (dropdownContent) {
        (dropdownContent as HTMLElement).blur();
        const dropdown = dropdownContent.parentElement;
        if (dropdown) {
          dropdown.blur();
        }
      }
    }
  });

  const savedTheme = localStorage.getItem('theme') || 'dracula';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

async function loadHosts() {
  try {
    hosts = await invoke<Host[]>("get_hosts");
    renderHosts();
  } catch (error) {
    console.error("Failed to load hosts:", error);
  }
}

function renderHosts() {
  const hostsTableWrapper = document.getElementById('hostsTableWrapper')!;
  const tbody = document.querySelector('#hostsTable tbody')!;
  const noHostsMessage = document.getElementById('noHostsMessage')!;
  
  if (hosts.length === 0) {
    hostsTableWrapper.classList.add('hidden');
    noHostsMessage.classList.remove('hidden');
  } else {
    hostsTableWrapper.classList.remove('hidden');
    noHostsMessage.classList.add('hidden');
    tbody.innerHTML = hosts.map(host => `
      <tr>
        <td class="text-center">${host.hostname}</td>
        <td class="text-center">${host.description}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-ghost" onclick="window.editHost('${host.hostname}')">Edit</button>
          <button class="btn btn-sm btn-ghost text-error" onclick="window.deleteHost('${host.hostname}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

async function saveHost(host: Host) {
  try {
    await invoke("save_host", { host });
    await loadHosts();
  } catch (error) {
    console.error("Failed to save host:", error);
    throw error;
  }
}

window.deleteHost = async (hostname: string) => {
  if (!confirm("Are you sure you want to delete this host?")) return;
  
  try {
    await invoke("delete_host", { hostname });
    await loadHosts();
  } catch (error) {
    console.error("Failed to delete host:", error);
  }
};

window.editHost = (hostname: string) => {
  const host = hosts.find(h => h.hostname === hostname);
  if (!host) return;

  const modal = document.getElementById("hostModal") as HTMLDialogElement;
  document.getElementById("modalTitle")!.textContent = "Edit Host";
  
  const form = document.getElementById("hostForm") as HTMLFormElement;
  (form.querySelector("#hostname") as HTMLInputElement).value = host.hostname;
  (form.querySelector("#description") as HTMLTextAreaElement).value = host.description;
  
  modal.showModal();
};

function isValidEmail(email: string): boolean {
  // This regex validates email format:
  // - Local part can contain letters, numbers, and certain special characters
  // - Must have @ symbol
  // - Domain part follows normal domain rules
  // - TLD must be at least 2 characters
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321
}

declare global {
  interface Window {
    editHost: (hostname: string) => void;
    deleteHost: (hostname: string) => void;
  }
}