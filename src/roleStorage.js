const ROLE_KEY = 'netshield.role';

export function getStoredRole() {
  return window.localStorage.getItem(ROLE_KEY);
}

export function setStoredRole(role) {
  window.localStorage.setItem(ROLE_KEY, role);
  window.dispatchEvent(new Event('netshield-role-change'));
}

export function clearStoredRole() {
  window.localStorage.removeItem(ROLE_KEY);
  window.dispatchEvent(new Event('netshield-role-change'));
}
