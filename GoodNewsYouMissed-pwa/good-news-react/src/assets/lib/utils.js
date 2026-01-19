// src/lib/utils.js - CORRECT VERSION
import CryptoJS from 'crypto-js';

export function generateArticleId(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL provided for ID generation');
  }
  
  return CryptoJS.SHA256(url).toString().substring(0, 32);
}

export async function withRetry(fn, maxAttempts = 3, initialDelay = 1000) {
  let attempt = 1;
  let delay = initialDelay;
  
  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      console.warn(`Retry attempt ${attempt}/${maxAttempts} failed. Waiting ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
      attempt++;
    }
  }
  throw new Error('Max retry attempts reached');
}