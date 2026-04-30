/**
 * Utility functions for WebAuthn biometric scanning.
 * This utilizes the browser's native navigator.credentials API.
 */

// Helper to convert buffer to base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert base64 to buffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function enrollBiometrics(userId: string, userName: string) {
  if (!window.PublicKeyCredential) {
    throw new Error('Biometric scanning is not supported by this browser.');
  }

  // Generate a random challenge
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const createOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "Graphic Canteen System",
      id: window.location.hostname
    },
    user: {
      id: Uint8Array.from(userId, c => c.charCodeAt(0)),
      name: userName,
      displayName: userName
    },
    pubKeyCredParams: [
      { alg: -7, type: "public-key" }, // ES256
      { alg: -257, type: "public-key" } // RS256
    ],
    authenticatorSelection: {
      userVerification: "preferred", // More compatible with varied hardware
      residentKey: "preferred",
      requireResidentKey: false
    },
    timeout: 60000,
    attestation: "none"
  };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: createOptions
    })) as PublicKeyCredential;

    if (!credential) throw new Error('Enrollment failed - no credential created.');

    const response = credential.response as AuthenticatorAttestationResponse;
    
    // We store the raw ID which is base64url encoded string in .id
    return {
      credentialId: credential.id,
      publicKey: bufferToBase64(response.getPublicKey())
    };
  } catch (err: any) {
    console.error("Enrollment Error:", err);
    if (err.name === 'NotAllowedError') throw new Error('Registration timed out or was cancelled by the user.');
    if (err.name === 'InvalidStateError') throw new Error('This device or fingerprint is already registered.');
    if (err.name === 'SecurityError') throw new Error('Security Error: WebAuthn requires HTTPS and matching domain.');
    throw err;
  }
}

export async function verifyBiometrics(credentialId: string) {
  if (!window.PublicKeyCredential) {
    throw new Error('Biometric scanning is not supported by this browser.');
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // The credential ID from navigator.credentials.create().id is base64url encoded.
  // We need to convert it to a buffer for the allowCredentials list.
  const allowCredentials = [{
    id: Uint8Array.from(atob(credentialId.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    type: "public-key" as const
  }];

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: "preferred", // More compatible
        timeout: 60000
      }
    });

    if (!assertion) throw new Error('Verification failed - no assertion produced.');
    return assertion;
  } catch (err: any) {
    console.error("Verification Error:", err);
    if (err.name === 'NotAllowedError') throw new Error('Verification timed out or was cancelled.');
    if (err.name === 'NotSupportedError') throw new Error('Your browser or hardware does not support this biometric method.');
    throw new Error(`Biometric Error: ${err.message}`);
  }
}
