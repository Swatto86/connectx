import { invoke } from "@tauri-apps/api/core";

interface Host {
  hostname: string;
  description: string;
}

interface StoredCredentials {
  username: string;
  password: string;
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
    const hostname = hostnameInput.value.trim();
    
    if (!isValidFQDN(hostname)) {
      alert("Please enter a valid hostname in the format: server.domain.com");
      return;
    }
    
    const host: Host = {
      hostname: hostname,
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

  document.getElementById("scanDomain")?.addEventListener("click", () => {
    const modal = document.getElementById("scanDomainModal") as HTMLDialogElement;
    const form = document.getElementById("scanDomainForm") as HTMLFormElement;
    form.reset();
    modal.showModal();
  });

  document.getElementById("scanDomainForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const domainInput = document.getElementById("domainName") as HTMLInputElement;
    const serverInput = document.getElementById("serverName") as HTMLInputElement;
    const submitButton = (e.target as HTMLFormElement).querySelector('button[type="submit"]') as HTMLButtonElement;
    const modal = document.getElementById("scanDomainModal") as HTMLDialogElement;
    
    const domain = domainInput.value.trim();
    const server = serverInput.value.trim();
    
    if (!isValidDomain(domain)) {
      showToast("Please enter a valid domain name (e.g., domain.com)", 'error');
      return;
    }

    if (!isValidServerName(server, domain)) {
      showToast(`Server must be a valid FQDN ending with .${domain}`, 'error');
      return;
    }
    
    try {
      submitButton.disabled = true;
      submitButton.classList.add('btn-disabled');
      submitButton.innerHTML = `
        <span class="loading loading-spinner loading-sm"></span>
        <span class="ml-2">Scanning...</span>
      `;
      
      const result = await invoke<string>("scan_domain", { domain, server });
      
      modal.close();
      showToast(result, 'success');
      await loadHosts();
      
    } catch (error) {
      console.error("Failed to scan domain:", error);
      showToast(`Failed to scan domain: ${error}`, 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove('btn-disabled');
      submitButton.innerHTML = 'Scan';
    }
  });
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
  const tbody = document.querySelector('#hostsTable tbody')!;
  const noHostsMessage = document.getElementById('noHostsMessage')!;
  
  if (hosts.length === 0) {
    noHostsMessage.classList.remove('hidden');
  } else {
    noHostsMessage.classList.add('hidden');
    tbody.innerHTML = hosts.map(host => `
      <tr class="border-b border-base-300">
        <td class="text-center">${host.hostname}</td>
        <td class="text-center">${host.description || ''}</td>
        <td class="text-center space-x-2">
          <button class="btn btn-sm btn-ghost" onclick="window.saveHostCredentials('${host.hostname}')">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </button>
          <button class="btn btn-sm btn-ghost" onclick="window.editHost('${host.hostname}')">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button class="btn btn-sm btn-ghost text-error" onclick="window.deleteHost('${host.hostname}')">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
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

function isValidFQDN(hostname: string): boolean {
  // This regex validates FQDN format:
  // - Contains at least one dot
  // - Only allows letters, numbers, dots, and hyphens
  // - Doesn't allow consecutive dots
  // - Doesn't start or end with a dot or hyphen
  // - Labels are 1-63 characters long
  // - Total length is 1-253 characters
  const fqdnRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$/;
  return fqdnRegex.test(hostname) && hostname.length <= 253;
}

function isValidDomain(domain: string): boolean {
  // Basic domain validation: letters, numbers, dots, hyphens
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9](\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

function isValidServerName(server: string, domain: string): boolean {
  // Server must be FQDN and end with the domain
  if (!isValidDomain(domain)) return false;
  
  // Convert both to lowercase for comparison
  const serverLower = server.toLowerCase();
  const domainLower = domain.toLowerCase();
  
  // Check if server ends with the domain
  if (!serverLower.endsWith(domainLower)) return false;
  
  // Check if server has a valid hostname prefix
  const prefix = serverLower.slice(0, -domainLower.length - 1); // Remove domain and dot
  const hostnameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  return hostnameRegex.test(prefix);
}

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const toastContainer = document.getElementById('toastContainer')!;
  const toast = document.createElement('div');
  toast.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'} mb-2`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  
  // Remove toast after 5 seconds
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

window.saveHostCredentials = async (hostname: string) => {
    const host = hosts.find(h => h.hostname === hostname);
    if (!host) return;
    
    try {
        // Get stored credentials
        const storedCreds = await invoke<StoredCredentials>("get_host_credentials", { hostname: host.hostname });
        
        // Show modal with credentials form
        const modal = document.getElementById("credentialsModal") as HTMLDialogElement;
        const hostnameEl = document.getElementById("credentialsHostname")!;
        const form = document.getElementById("credentialsForm") as HTMLFormElement;
        const usernameInput = document.getElementById("credUsername") as HTMLInputElement;
        const passwordInput = document.getElementById("credPassword") as HTMLInputElement;
        
        // Set hostname display
        hostnameEl.textContent = `Host: ${host.hostname}`;
        
        // If we have stored credentials, populate them
        if (storedCreds) {
            usernameInput.value = storedCreds.username;
            passwordInput.value = storedCreds.password;
        } else {
            // If no stored credentials, try to get default ones
            const defaultCreds = await invoke<StoredCredentials>("get_stored_credentials");
            if (defaultCreds) {
                usernameInput.value = defaultCreds.username;
                passwordInput.value = defaultCreds.password;
            } else {
                form.reset();
            }
        }

        // Handle form submission
        const handleSubmit = async (e: Event) => {
            e.preventDefault();
            try {
                await invoke("save_host_credentials", { 
                    host,
                    credentials: {
                        username: usernameInput.value,
                        password: passwordInput.value
                    }
                });
                showToast(`Credentials saved for ${hostname}`, 'success');
                modal.close();
            } catch (error) {
                console.error("Failed to save host credentials:", error);
                showToast(`Failed to save credentials: ${error}`, 'error');
            }
        };

        form.removeEventListener('submit', handleSubmit);
        form.addEventListener('submit', handleSubmit);
        
        modal.showModal();
        
    } catch (error) {
        console.error("Failed to manage host credentials:", error);
        showToast(`Failed to manage credentials: ${error}`, 'error');
    }
};

declare global {
  interface Window {
    editHost: (hostname: string) => void;
    deleteHost: (hostname: string) => void;
    saveHostCredentials: (hostname: string) => void;
  }
}