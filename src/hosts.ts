import { invoke } from "@tauri-apps/api/core";

interface Host {
  hostname: string;
  ip_address: string;
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
    
    const host: Host = {
      hostname: (document.getElementById("hostname") as HTMLInputElement).value,
      ip_address: (document.getElementById("ipAddress") as HTMLInputElement).value,
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
  const tbody = document.getElementById("hostTableBody");
  if (!tbody) return;

  if (hosts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-base-content/60">
          No hosts found. Add one to get started.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = hosts.map(host => `
    <tr>
      <td class="text-center">${host.hostname}</td>
      <td class="text-center">${host.ip_address}</td>
      <td class="text-center">${host.description}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-ghost" onclick="window.editHost('${host.hostname}')">Edit</button>
        <button class="btn btn-sm btn-ghost text-error" onclick="window.deleteHost('${host.hostname}')">Delete</button>
      </td>
    </tr>
  `).join("");
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
  (form.querySelector("#ipAddress") as HTMLInputElement).value = host.ip_address;
  (form.querySelector("#description") as HTMLTextAreaElement).value = host.description;
  
  modal.showModal();
};

declare global {
  interface Window {
    editHost: (hostname: string) => void;
    deleteHost: (hostname: string) => void;
  }
}