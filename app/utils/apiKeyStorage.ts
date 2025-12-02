// Secure API key storage using Web Crypto API
// Note: This provides basic obfuscation. For production, consider server-side storage or more sophisticated encryption.

const STORAGE_KEY = 'ld_api_key_encrypted';
const REMEMBER_KEY = 'ld_remember_api_key';

// Simple encryption using Web Crypto API
async function encryptApiKey(apiKey: string): Promise<string> {
  try {
    // Generate a key from a fixed password (in production, use a more secure approach)
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    
    // Use a simple XOR cipher with a key derived from a constant
    // Note: This is basic obfuscation, not true encryption
    const key = encoder.encode('ld-health-check-key-2024');
    const encrypted = new Uint8Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i] ^ key[i % key.length];
    }
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...Array.from(encrypted)));
  } catch (error) {
    console.error('Error encrypting API key:', error);
    throw error;
  }
}

// Decrypt API key
async function decryptApiKey(encrypted: string): Promise<string> {
  try {
    // Decode from base64
    const encryptedBytes = Uint8Array.from(
      atob(encrypted),
      c => c.charCodeAt(0)
    );
    
    const encoder = new TextEncoder();
    const key = encoder.encode('ld-health-check-key-2024');
    const decrypted = new Uint8Array(encryptedBytes.length);
    
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted[i] = encryptedBytes[i] ^ key[i % key.length];
    }
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Error decrypting API key:', error);
    throw error;
  }
}

export async function saveApiKey(apiKey: string, remember: boolean): Promise<void> {
  if (!remember) {
    // Clear storage if user doesn't want to remember
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    return;
  }
  
  try {
    const encrypted = await encryptApiKey(apiKey);
    localStorage.setItem(STORAGE_KEY, encrypted);
    localStorage.setItem(REMEMBER_KEY, 'true');
  } catch (error) {
    console.error('Error saving API key:', error);
    throw new Error('Failed to save API key');
  }
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY);
    if (!remember || remember !== 'true') {
      return null;
    }
    
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) {
      return null;
    }
    
    return await decryptApiKey(encrypted);
  } catch (error) {
    console.error('Error loading API key:', error);
    // Clear corrupted data
    clearApiKey();
    return null;
  }
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

export function shouldRememberApiKey(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === 'true';
}

