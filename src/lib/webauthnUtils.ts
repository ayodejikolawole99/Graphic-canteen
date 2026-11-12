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
  // 1. Try SecuGen WebAPI (Official)
  try {
    const resp = await fetch("http://localhost:8000/SGICAP?timeout=10000&quality=50&templateFormat=ISO").catch(() => 
                  fetch("https://localhost:8443/SGICAP", { method: 'POST', body: JSON.stringify({ timeout: 10000, quality: 50, templateFormat: "ISO" }) }));
    const data = await resp.json();
    if (data && (data.ErrorCode === 0 || data.ErrorCode === "0")) {
      return {
        credentialId: "SG_" + data.TemplateBase64,
        publicKey: "SECUGEN_WAPI_V1"
      };
    }
  } catch (e) {
    console.log("Official SecuGen WebAPI not responding, checking Python bridge...");
  }

  // 2. Try Python Local Bridge (Custom)
  try {
    const resp = await fetch("http://localhost:5000/api/scan");
    const data = await resp.json();
    if (data.status === 'success') {
      return {
        credentialId: data.template,
        publicKey: "SECUGEN_PY_BRIDGE"
      };
    }
  } catch (e) {
    console.log("Python Bridge not available. Falling back to browser passkeys.");
  }

  // 3. Fallback to standard Browser Passkeys (WebAuthn)
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
    if (err.message?.toLowerCase().includes('permissions policy') || err.message?.toLowerCase().includes('feature is not enabled')) {
      throw new Error('SECURE ACCESS BLOCKED: Biometric hardware (Fingerprint/FaceID) cannot be accessed within this preview window for security reasons. \n\nFIX: Please open the application in a NEW TAB using the "Open Window" icon at the bottom right of the screen.');
    }
    if (err.name === 'NotAllowedError') throw new Error('Registration timed out or was cancelled by the user. Ensure you are using a secure browser.');
    if (err.name === 'InvalidStateError') throw new Error('This device or fingerprint is already registered.');
    if (err.name === 'SecurityError') {
      if (window.self !== window.top) {
        throw new Error('Security Error: Biometrics are blocked in this frame. Please open the app in a new tab.');
      }
      throw new Error('Security Error: WebAuthn requires HTTPS and matching domain.');
    }
    if (err.name === 'NotSupportedError') throw new Error('Your browser supports the API, but this specific hardware/method is not supported.');
    throw err;
  }
}

export async function verifyBiometrics(credentialId: string) {
  // Check if it's a SecuGen Token
  if (credentialId.startsWith("SG_")) {
    const storedTemplate = credentialId.replace("SG_", "");
    try {
      const resp = await fetch("https://localhost:8443/SGICAP", { method: 'POST', body: JSON.stringify({ timeout: 10000, quality: 50, templateFormat: "ISO" }) }).catch(() => 
                    fetch("http://localhost:8000/SGICAP?timeout=10000&quality=50&templateFormat=ISO"));
      const data = await resp.json();
      if (data && (data.ErrorCode === 0 || data.ErrorCode === "0")) {
        const newTemplate = data.TemplateBase64;
        // Try official match
        try {
          const matchResp = await fetch(`http://localhost:8000/SGIMATCH?template1=${encodeURIComponent(storedTemplate)}&template2=${encodeURIComponent(newTemplate)}`).catch(() => 
                              fetch(`https://localhost:8443/SGIMATCH`, { method: 'POST', body: JSON.stringify({ template1: storedTemplate, template2: newTemplate }) }));
          const matchData = await matchResp.json();
          const score = matchData.MatchingScore || matchData.score || 0;
          if (score > 100) return true;
        } catch (e) {
          // If official fails, try the Python bridge match
          const pyMatchResp = await fetch("http://localhost:5000/api/match", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template1: storedTemplate, template2: newTemplate })
          });
          const pyMatchData = await pyMatchResp.json();
          if (pyMatchData.match || pyMatchData.score > 100) return true;
        }
        throw new Error("Biometric mismatch. Please try scanning again.");
      }
      throw new Error("SecuGen Scanner Error: " + (data.ErrorMessage || "Unknown error"));
    } catch (e: any) {
      throw new Error("Scanner services not responding. Ensure either SecuGen WebAPI or Python Bridge is running.");
    }
  }

  if (!window.PublicKeyCredential) {
    throw new Error('Biometric scanning is not supported by this browser.');
  }

  // Generate a random challenge
  const challenge = new Uint8Array(32);
  const crypto = window.crypto || (window as any).msCrypto;
  crypto.getRandomValues(challenge);

  // The credential ID from navigator.credentials.create().id is base64url encoded.
  // We need to convert it to a buffer for the allowCredentials list.
  const base64 = credentialId.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
  
  const allowCredentials: PublicKeyCredentialDescriptor[] = [{
    id: base64ToBuffer(paddedBase64),
    type: "public-key"
  }];

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: "preferred", // More compatible with varied hardware
        timeout: 60000
      }
    });

    if (!assertion) throw new Error('Verification failed - no biometric signal produced.');
    return assertion;
  } catch (err: any) {
    console.error("Verification Error:", err);
    if (err.message?.toLowerCase().includes('permissions policy') || err.message?.toLowerCase().includes('feature is not enabled')) {
      throw new Error('SECURE ACCESS BLOCKED: Biometric hardware cannot be accessed within this window. \n\nFIX: Please open the application in a NEW TAB using the "Open Window" icon at the bottom right.');
    }
    if (err.name === 'NotAllowedError') throw new Error('Biometric scan was cancelled or timed out.');
    if (err.name === 'NotSupportedError') throw new Error('Your hardware/browser doesn\'t support this security method.');
    if (err.name === 'SecurityError') {
      if (window.self !== window.top) {
        throw new Error('Security Error: Biometrics are restricted in iframes. Please open the app in a new tab.');
      }
      throw new Error('Security Error: WebAuthn requires a secure context (HTTPS).');
    }
    throw new Error(`Biometric hardware error: ${err.message}`);
  }
}
