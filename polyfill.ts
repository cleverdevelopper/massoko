import 'react-native-get-random-values';
import { install } from 'react-native-quick-crypto';
import { Buffer } from 'buffer';
import { TextEncoder } from 'text-encoding';

// Inject global.crypto and global.crypto.subtle
install();

global.Buffer = Buffer;
global.TextEncoder = TextEncoder;

global.TextDecoder = class {
  encoding: string;

  constructor(encoding = 'utf-8') {
    this.encoding = encoding.toLowerCase();
  }

  decode(buffer: ArrayBuffer | Uint8Array) {
    const bytes = new Uint8Array(buffer);

    if (this.encoding === 'utf-16le') {
      let result = '';
      for (let i = 0; i < bytes.length; i += 2) {
        result += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }
      return result;
    }

    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }
} as any;

// Optional: Also define on window and self just in case libraries aggressively check them
if (typeof window !== 'undefined') {
  (window as any).TextDecoder = global.TextDecoder;
  (window as any).TextEncoder = global.TextEncoder;
}

if (typeof self !== 'undefined') {
  (self as any).TextDecoder = global.TextDecoder;
  (self as any).TextEncoder = global.TextEncoder;
}

console.log('TEST TEXT DECODER:', new TextDecoder('utf-16le').decode(new Uint8Array([72, 0, 73, 0])));
