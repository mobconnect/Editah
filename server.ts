import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import AdmZip from 'adm-zip';
import admin from 'firebase-admin';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };
import crypto from 'crypto';
import forge from 'node-forge';
import fs from 'fs';

import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Initialize Firebase Admin
const firebaseApp = getApps().length === 0 
  ? initializeApp({
      credential: admin.credential.applicationDefault()
    })
  : getApp();

// Correctly initialize Firestore with the specific database ID
// If firestoreDatabaseId is not provided or fails, we will handle it gracefully in the routes
let db: admin.firestore.Firestore | null = null;
let isFirestoreActive = false;

try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  db = dbId && dbId !== "(default)" 
    ? getFirestore(firebaseApp, dbId)
    : getFirestore(firebaseApp);
  console.log(`Firestore initialized with database: ${dbId || '(default)'}`);
} catch (err) {
  console.error('Failed to initialize Firestore initialization:', err);
}

// Test database connection with a small delay
setTimeout(async () => {
  if (!db) return;
  try {
    const dbId = firebaseConfig.firestoreDatabaseId;
    console.log('Testing Firestore connection for database:', dbId || '(default)');
    await db.listCollections();
    isFirestoreActive = true;
    console.log('Firestore connection check completed successfully.');
  } catch (err: any) {
    isFirestoreActive = false;
    if (err.message && err.message.includes('permission_denied') || err.message.includes('API has not been used')) {
      console.warn('Firestore connectivity limited: Project API not enabled.');
    } else {
      console.error('Firestore connection test error:', err.message);
    }
  }
}, 5000);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// API: Get Firestore Status
app.get('/api/status/firestore', (req, res) => {
  res.json({ 
    active: isFirestoreActive,
    databaseId: firebaseConfig.firestoreDatabaseId || '(default)'
  });
});

// Setup multer for memory storage with higher limits
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit
});

// Store active bundles with version control
const activeBundles = new Map<string, { 
  versions: { buffer: Buffer, timestamp: number, label: string }[],
  currentIndex: number,
  name: string 
}>();

// Helper to get current zip from bundle state
function getCurrentZip(bundleId: string): AdmZip | null {
  const state = activeBundles.get(bundleId);
  if (!state) return null;
  return new AdmZip(state.versions[state.currentIndex].buffer);
}

// Helper to update current version
function updateCurrentVersion(bundleId: string, zip: AdmZip, label: string = "Updated") {
  const state = activeBundles.get(bundleId);
  if (!state) return;
  
  const buffer = zip.toBuffer();
  // If we are at a branch (reverting and then editing), clear future versions
  state.versions = state.versions.slice(0, state.currentIndex + 1);
  state.versions.push({ buffer, timestamp: Date.now(), label });
  state.currentIndex = state.versions.length - 1;
  
  // CRITICAL: Keep history strictly limited to prevent OOM on large AABs
  // For files ~100MB, 3 versions = 300MB + overhead.
  if (state.versions.length > 2) {
    state.versions.shift();
    state.currentIndex--;
  }
}

// API routes go here FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API: RPC for actions
app.post('/api/rpc', async (req, res) => {
  const { service, method, arguments: args } = req.body;
  
  if (service === 'bundle' && method === 'fix_manifest') {
    const { bundleId, issueType } = args;
    const state = activeBundles.get(bundleId);
    if (!state) return res.status(404).json({ error: 'Bundle not found' });

    const zip = new AdmZip(state.versions[state.currentIndex].buffer);
    const manifestEntry = zip.getEntries().find(e => e.entryName.includes('AndroidManifest.xml'));
    if (!manifestEntry) return res.status(404).json({ error: 'Manifest not found' });

    let content = manifestEntry.getData().toString('utf8');
    let changed = false;

    if (issueType === 'SDK Level' || issueType === 'TargetSDK') {
      const target = args.value || '34';
      if (content.includes('android:targetSdkVersion')) {
        content = content.replace(/android:targetSdkVersion="\d+"/, `android:targetSdkVersion="${target}"`);
      } else {
        content = content.replace('<uses-sdk', `<uses-sdk android:targetSdkVersion="${target}"`);
      }
      changed = true;
    } else if (issueType === 'MinSDK') {
      const min = args.value || '24';
      if (content.includes('android:minSdkVersion')) {
        content = content.replace(/android:minSdkVersion="\d+"/, `android:minSdkVersion="${min}"`);
      } else {
        content = content.replace('<uses-sdk', `<uses-sdk android:minSdkVersion="${min}"`);
      }
      changed = true;
    } else if (issueType === 'VersionCode') {
      const vCode = parseInt(args.value || '1');
      content = content.replace(/android:versionCode="\d+"/, `android:versionCode="${vCode}"`);
      changed = true;
    } else if (issueType === 'VersionName') {
      content = content.replace(/android:versionName="[^"]+"/, `android:versionName="${args.value}"`);
      changed = true;
    } else if (issueType === 'PackageID') {
      content = content.replace(/package="[^"]+"/, `package="${args.value}"`);
      changed = true;
    } else if ((issueType === 'Security' || issueType === 'Cleartext') && content.includes('usesCleartextTraffic')) {
      const val = args.value === 'true' ? 'true' : 'false';
      content = content.replace(/android:usesCleartextTraffic="[^"]+"/, `android:usesCleartextTraffic="${val}"`);
      changed = true;
    } else if ((issueType === 'Security' || issueType === 'Cleartext') && !content.includes('android:usesCleartextTraffic')) {
      const val = args.value === 'true' ? 'true' : 'false';
      content = content.replace('<application', `<application android:usesCleartextTraffic="${val}"`);
      changed = true;
    } else if (issueType === 'Security' || issueType === 'Exported') {
      // Add exported="true" if missing on components with filter
      content = content.replace(/(<(activity|service|receiver)(?:(?!android:exported=)[^>])*)(>[\s\S]*?<intent-filter)/g, (match, start, tag, rest) => {
         return `${start} android:exported="true"${rest}`;
      });
      changed = true;
    } else if (issueType === 'Security (Release)') {
      content = content.replace(/android:debuggable="true"/, '');
      changed = true;
    } else if (issueType === 'Resource') {
      // Remove duplicate uses-permission
      const seen = new Set();
      content = content.replace(/<uses-permission[^>]+android:name="([^"]+)"[^>]*\/>/g, (match, name) => {
        if (seen.has(name)) return '';
        seen.add(name);
        return match;
      });
      changed = true;
    } else if (issueType === 'Resource (Strings)') {
      const stringsEntry = zip.getEntries().find(e => e.entryName === 'base/res/values/strings.xml');
      if (stringsEntry) {
        let sc = stringsEntry.getData().toString('utf8');
        const seen = new Set();
        sc = sc.replace(/<string[^>]+name="([^"]+)"[^>]*>[\s\S]*?<\/string>/g, (match, name) => {
          if (seen.has(name)) return '';
          seen.add(name);
          return match;
        });
        zip.updateFile(stringsEntry.entryName, Buffer.from(sc, 'utf8'));
        updateCurrentVersion(bundleId, zip, 'Consolidated duplicate string keys');
        return res.json({ status: 'success', message: 'Strings.xml consolidated.' });
      }
    }

    if (changed) {
      zip.updateFile(manifestEntry.entryName, Buffer.from(content, 'utf8'));
      updateCurrentVersion(bundleId, zip, `Auto-fixed ${issueType} in manifest`);
      return res.json({ status: 'success', message: 'Manifest patched successfully.' });
    }
    return res.json({ status: 'no_change', message: 'No specific fix applied.' });
  }

  res.status(400).json({ error: 'Unknown service or method' });
});

// API: Smart Analysis
app.post('/api/analyze', async (req, res) => {
  const { bundleId, filePath } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    let context = '';
    const entries = zip.getEntries();
    const manifestEntry = entries.find(e => e.entryName.includes('AndroidManifest.xml'));
    let sdkContext = 'SDK Info: Unknown (Manifest not found or binary)\n';

    if (manifestEntry) {
      try {
        const content = manifestEntry.getData().toString('utf8');
        const targetMatch = content.match(/android:targetSdkVersion="(\d+)"/);
        const minMatch = content.match(/android:minSdkVersion="(\d+)"/);
        if (targetMatch || minMatch) {
          sdkContext = `SDK Info: Target API ${targetMatch?.[1] || 'Unknown'}, Min API ${minMatch?.[1] || 'Unknown'}\n`;
        }
      } catch (e) {
        // Ignore binary read errors
      }
    }

    if (filePath) {
      const entry = zip.getEntry(filePath);
      if (entry) {
        context = `${sdkContext}File Content (${filePath}):\n${entry.getData().toString('utf8').substring(0, 5000)}`;
      }
    } else {
      const files = entries.map(e => e.entryName).join('\n');
      context = `${sdkContext}Bundle Structure:\n${files.substring(0, 5000)}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an Android technical expert specialized in Android App Bundle (.aab) internals and Google Play Console requirements. 
      
      Analyze the following data from an AAB. Note that AABs follow a strict structure:
      - 'base/manifest/AndroidManifest.xml' (The core manifest)
      - 'base/assets/', 'base/res/', 'base/dex/' (Core components)
      - 'BundleConfig.pb' and 'base/resources.pb' (Protocol Buffers)
      
      Structure Context:
      ${context}

      Your goal is to provide high-level "smart thinking" insights. Use web search to check for the latest:
      1. Google Play SDK requirements (API levels).
      2. Play Integrity API best practices.
      3. Common Play Console rejection reasons (duplicate permissions, intent-filter vulnerabilities).
      
      Specifically check AndroidManifest.xml for:
      - Missing 'android:exported' attributes on components with intent-filters (API 31+ requirement).
      - 'usesCleartextTraffic' being true or unset when Internet permission is present.
      - Unprotected sensitive permissions or exported components.

      Provide actionable feedback on structural integrity and store-readiness, including specific suggestions for quick fixes if issues are found.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [{ googleSearch: {} }]
      }
    });

    res.json({ analysis: response.text });
  } catch (err: any) {
    console.error(err);
    const errMsg = err?.message || String(err);
    if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || err?.status === 429) {
      res.status(429).json({
        error: 'Quota Exceeded',
        message: 'You have exceeded your current Google Gemini API quota. Please add/configure your own Gemini API key in Settings > Secrets for higher limits, or try again later.'
      });
    } else {
      res.status(500).json({ error: errMsg || 'AI Analysis failed' });
    }
  }
});

// API: Smart Fix
app.post('/api/smart-fix', async (req, res) => {
  const { bundleId, issueDescription } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    // Collect context: Sample important files
    const entries = zip.getEntries();
    const manifest = entries.find(e => e.entryName.includes('AndroidManifest.xml'));
    const buildProps = entries.find(e => e.entryName.includes('build.prop'));
    
    let context = `Bundle Summary: ${entries.length} files.\n`;
    context += `Paths detected: ${entries.slice(0, 20).map(e => e.entryName).join(', ')}...\n`;
    
    if (manifest) {
      try {
        const manifestData = manifest.getData().toString('utf8');
        const targetMatch = manifestData.match(/android:targetSdkVersion="(\d+)"/);
        const minMatch = manifestData.match(/android:minSdkVersion="(\d+)"/);
        if (targetMatch || minMatch) {
          context += `\nSDK Configuration: Target API ${targetMatch?.[1] || 'Unknown'}, Min API ${minMatch?.[1] || 'Unknown'}\n`;
        }
        context += `\nAndroidManifest.xml Context (Partial):\n${manifestData.substring(0, 3500)}`;
      } catch (e) {
        context += `\nAndroidManifest.xml is binary/proto-encoded and cannot be read as plain text directly without a proto decoder.`;
      }
    }
    
    if (buildProps) context += `\nBuild Props Context:\n${buildProps.getData().toString('utf8').substring(0, 1500)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an Android technical expert tasked with fixing issues in an Android App Bundle (.aab).
      
      User Issue/Goal: ${issueDescription}
      
      Bundle Context:
      ${context}
      
      Technical Instructions for Store-Ready AABs:
      1. Bundle Structure: All files MUST stay within their standard subdirectories (e.g. 'base/manifest/', 'base/res/').
      2. AndroidManifest.xml: Ensure 'xmlns:android="http://schemas.android.com/apk/res/android"' is present. 
      3. Global Compatibility: Check for localization resources in 'base/res/values-*/strings.xml'. Ensure resource IDs are consistent across languages to prevent crashes.
      4. Permission Management: Check for duplicate <uses-permission> or <permission> tags.
      5. Intent-Filters: Ensure exported components with intent-filters explicitly set android:exported="true" or "false" (API 31+). This is a critical fix for API 31+ apps.
      6. Security Hardening: If cleartext traffic is enabled, suggest adding a Network Security Configuration or setting 'android:usesCleartextTraffic="false"'.
      7. Language Packs: Verify that if the user adds a new language resource, it follows the 'values-[iso-code]' directory naming convention standard.
      
      Instructions for Output:
      1. Propose exact file modifications. Use web search to verify the latest Android schemas and localization standards.
      2. Return ONLY JSON:
         {
           "explanation": "Brief technical reasoning focused on global compatibility",
           "changes": [
             { "path": "base/res/values-es/strings.xml", "content": "..." }
           ]
         }
      3. Use absolute bundle paths with 'base/' prefix.
      4. Avoid modifying 'resources.pb' directly as it is a binary protocol buffer.
      5. Use web search to verify specific intent-filter, permission syntax, or localization ISO codes (API 33+).`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text);
    
    // Apply changes
    for (const change of result.changes) {
      // Basic sanitization/verification
      if (!change.path.startsWith('base/') && !change.path.includes('.pb')) {
        console.warn(`AI proposed change to non-standard path: ${change.path}`);
      }
      zip.addFile(change.path, Buffer.from(change.content, 'utf-8'));
    }

    updateCurrentVersion(bundleId, zip, result.explanation);

    // Refresh file list
    const updatedEntries = zip.getEntries().map(entry => ({
      name: entry.entryName,
      size: entry.header.size,
      isDirectory: entry.isDirectory
    }));

    res.json({ 
      success: true, 
      explanation: result.explanation, 
      files: updatedEntries,
      appliedChanges: result.changes.map((c: any) => c.path)
    });
  } catch (err: any) {
    console.error(err);
    const errMsg = err?.message || String(err);
    if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || err?.status === 429) {
      res.status(429).json({
        error: 'Quota Exceeded',
        message: 'You have exceeded your current Google Gemini API quota. Please add/configure your own Gemini API key in Settings > Secrets for higher limits, or try again later.'
      });
    } else {
      res.status(500).json({ error: errMsg || 'AI Smart Fix failed' });
    }
  }
});

// Store active bundles in memory
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const bundleId = Math.random().toString(36).substring(7);
    
    activeBundles.set(bundleId, { 
      versions: [{ buffer: req.file.buffer, timestamp: Date.now(), label: "Original" }],
      currentIndex: 0,
      name: req.file.originalname 
    });

    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries().map(entry => ({
      name: entry.entryName,
      size: entry.header.size,
      isDirectory: entry.isDirectory
    }));

    res.json({ 
      bundleId, 
      name: req.file.originalname,
      files: entries 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse AAB file' });
  }
});

// Pure JavaScript/Node.js APK Signing Helpers and API Endpoint
function foldLine(line: string): string {
  if (line.length <= 70) return line;
  let result = line.slice(0, 70);
  let rest = line.slice(70);
  while (rest.length > 0) {
    result += '\r\n ' + rest.slice(0, 69);
    rest = rest.slice(69);
  }
  return result;
}

function signApk(apkBuffer: Buffer, options: {
  mode: 'debug' | 'release';
  keystoreBuffer?: Buffer;
  keystorePassword?: string;
  keyAlias?: string;
  keyPassword?: string;
  algorithm: 'SHA-256' | 'SHA-1';
}): Buffer {
  const { mode, keystoreBuffer, keystorePassword, keyAlias, keyPassword, algorithm } = options;
  
  let privateKey: any;
  let certificate: any;

  if (mode === 'debug') {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);
    
    const attrs = [
      { name: 'commonName', value: 'Android Debug' },
      { name: 'organizationName', value: 'Android' },
      { name: 'organizationalUnitName', value: 'Android Debug' },
      { name: 'countryName', value: 'US' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    
    privateKey = keys.privateKey;
    certificate = cert;
  } else {
    if (!keystoreBuffer) {
      throw new Error('Keystore file is required for release signing');
    }
    const password = keystorePassword || '';
    
    try {
      const p12Der = keystoreBuffer.toString('binary');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
      
      const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
      const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
      const allKeyBags = [...shroudedKeyBags, ...plainKeyBags];

      let selectedKeyBag: any = null;
      if (keyAlias) {
        selectedKeyBag = allKeyBags.find((b: any) => {
          const friendlyName = b.attributes?.friendlyName?.[0] || '';
          const localKeyId = b.attributes?.localKeyId?.[0] || '';
          return friendlyName.toLowerCase() === keyAlias.toLowerCase() || localKeyId === keyAlias;
        });
      }
      if (!selectedKeyBag) {
        selectedKeyBag = allKeyBags[0];
      }

      if (!selectedKeyBag) {
        throw new Error(`No private keys found in the keystore.`);
      }

      privateKey = selectedKeyBag.key;

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      let selectedCertBag: any = null;
      if (keyAlias) {
        selectedCertBag = certBags.find((b: any) => {
          const friendlyName = b.attributes?.friendlyName?.[0] || '';
          const localKeyId = b.attributes?.localKeyId?.[0] || '';
          return friendlyName.toLowerCase() === keyAlias.toLowerCase() || localKeyId === keyAlias;
        });
      }
      if (!selectedCertBag) {
        selectedCertBag = certBags[0];
      }

      if (!selectedCertBag || !selectedCertBag.cert) {
        throw new Error(`No certificate found in the keystore.`);
      }

      certificate = selectedCertBag.cert;
    } catch (err: any) {
      throw new Error('Failed to parse keystore. Ensure it is a valid PKCS#12 (.p12/.keystore/.jks) file and the password is correct. Detail: ' + err.message);
    }
  }

  const zip = new AdmZip(apkBuffer);
  const entries = zip.getEntries();
  
  const cleanEntries: { name: string, data: Buffer }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    const isSigFile = name.startsWith('META-INF/') && (
      name.endsWith('.SF') || 
      name.endsWith('.RSA') || 
      name.endsWith('.DSA') || 
      name.endsWith('.EC') || 
      name.endsWith('MANIFEST.MF')
    );
    if (!isSigFile) {
      cleanEntries.push({
        name: entry.entryName,
        data: entry.getData()
      });
    }
  }

  const algo = algorithm === 'SHA-1' ? 'SHA-1' : 'SHA-256';
  const digestName = algo === 'SHA-1' ? 'SHA-1-Digest' : 'SHA-256-Digest';
  
  let manifest = 'Manifest-Version: 1.0\r\n';
  manifest += 'Created-By: 1.0 (Android Signer)\r\n\r\n';
  
  const manifestSections: { name: string, content: string }[] = [];
  
  for (const entry of cleanEntries) {
    const hash = crypto.createHash(algo === 'SHA-1' ? 'sha1' : 'sha256').update(entry.data).digest('base64');
    
    const lines = [
      `Name: ${entry.name}`,
      `${digestName}: ${hash}`
    ];
    
    const foldedSection = lines.map(foldLine).join('\r\n') + '\r\n';
    manifestSections.push({ name: entry.name, content: foldedSection });
    manifest += foldedSection + '\r\n';
  }

  const manifestHash = crypto.createHash(algo === 'SHA-1' ? 'sha1' : 'sha256').update(Buffer.from(manifest, 'utf8')).digest('base64');
  
  let sf = 'Signature-Version: 1.0\r\n';
  sf += 'Created-By: 1.0 (Android Signer)\r\n';
  sf += foldLine(`${digestName}-Manifest: ${manifestHash}`) + '\r\n\r\n';
  
  for (const sect of manifestSections) {
    const sectBytes = Buffer.from(sect.content + '\r\n', 'utf8');
    const sectHash = crypto.createHash(algo === 'SHA-1' ? 'sha1' : 'sha256').update(sectBytes).digest('base64');
    
    const sfLines = [
      `Name: ${sect.name}`,
      `${digestName}: ${sectHash}`
    ];
    sf += sfLines.map(foldLine).join('\r\n') + '\r\n\r\n';
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(sf, 'utf8');
  p7.addCertificate(certificate);
  p7.addSigner({
    key: privateKey,
    certificate: certificate,
    digestAlgorithm: algo === 'SHA-1' ? forge.pki.oids.sha1 : forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date() as any
      },
      {
        type: forge.pki.oids.messageDigest
      }
    ]
  });
  
  p7.sign();
  const rsaDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const rsaBuffer = Buffer.from(rsaDer, 'binary');

  const signedZip = new AdmZip();
  for (const entry of cleanEntries) {
    signedZip.addFile(entry.name, entry.data);
  }
  
  signedZip.addFile('META-INF/MANIFEST.MF', Buffer.from(manifest, 'utf8'));
  signedZip.addFile('META-INF/CERT.SF', Buffer.from(sf, 'utf8'));
  signedZip.addFile('META-INF/CERT.RSA', rsaBuffer);

  return signedZip.toBuffer();
}

app.post('/api/sign', upload.single('keystore'), (req, res) => {
  const { bundleId, mode, keystorePassword, keyAlias, keyPassword, algorithm } = req.body;
  const state = activeBundles.get(bundleId);
  if (!state) {
    return res.status(404).json({ error: 'Bundle/APK not found' });
  }

  try {
    const currentBuffer = state.versions[state.currentIndex].buffer;
    const keystoreBuffer = req.file ? req.file.buffer : undefined;

    const signedBuffer = signApk(currentBuffer, {
      mode: mode || 'debug',
      keystoreBuffer,
      keystorePassword,
      keyAlias,
      keyPassword,
      algorithm: algorithm || 'SHA-256'
    });

    updateCurrentVersion(bundleId, new AdmZip(signedBuffer), `Signed (${mode || 'debug'})`);

    res.json({
      success: true,
      message: `Successfully signed file using ${mode || 'debug'} configuration.`,
      files: new AdmZip(signedBuffer).getEntries().map(e => ({
        name: e.entryName,
        size: e.header.size,
        isDirectory: e.isDirectory
      }))
    });
  } catch (err: any) {
    console.error('APK signing error:', err);
    res.status(500).json({ error: err.message || 'Failed to sign APK file' });
  }
});

// API: Replace File in AAB
app.get('/api/bundle/:bundleId', (req, res) => {
  const { bundleId } = req.params;
  const state = activeBundles.get(bundleId);
  if (!state) return res.status(404).json({ error: 'Bundle not found' });

  const zip = new AdmZip(state.versions[state.currentIndex].buffer);
  const entries = zip.getEntries().map(entry => ({
    name: entry.entryName,
    size: entry.header.size,
    isDirectory: entry.isDirectory
  }));

  res.json({
    bundleId,
    name: state.name,
    files: entries
  });
});

// API: Get Individual File Content
app.get('/api/bundle/:bundleId/file', (req, res) => {
  const { bundleId } = req.params;
  const filePath = req.query.path as string;
  
  if (!filePath) {
    return res.status(400).json({ error: 'File path parameter is required' });
  }

  const state = activeBundles.get(bundleId);
  if (!state) return res.status(404).json({ error: 'Bundle not found' });

  try {
    const zip = new AdmZip(state.versions[state.currentIndex].buffer);
    const entry = zip.getEntry(filePath);
    if (!entry) {
      return res.status(404).json({ error: `File not found in bundle: ${filePath}` });
    }

    if (entry.isDirectory) {
      return res.status(400).json({ error: 'Cannot view directory contents' });
    }

    const buffer = entry.getData();
    
    // Determine content type and formatting
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.xml') {
      res.setHeader('Content-Type', 'text/xml');
      return res.send(buffer.toString('utf8'));
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico'].includes(ext)) {
      const mimeTypes: { [key: string]: string } = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      return res.send(buffer);
    } else if (['.json', '.txt', '.properties', '.cfg', '.html', '.md', '.yml', '.yaml', '.gradle', '.pro', '.conf'].includes(ext)) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(buffer.toString('utf8'));
    } else {
      // Default fallback as text if it seems readable, or octet-stream
      // Let's do a simple heuristic check to see if it's text
      let isBinary = false;
      const checkLength = Math.min(buffer.length, 512);
      for (let i = 0; i < checkLength; i++) {
        const charCode = buffer[i];
        if (charCode === 0) {
          isBinary = true;
          break;
        }
      }
      
      if (!isBinary) {
        res.setHeader('Content-Type', 'text/plain');
        return res.send(buffer.toString('utf8'));
      }
      
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(buffer);
    }
  } catch (err: any) {
    console.error('File fetch error:', err);
    res.status(500).json({ error: err.message || 'Failed to read file from bundle' });
  }
});

app.post('/api/replace-file', upload.single('file'), (req, res) => {
  const { bundleId, targetPath } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip || !req.file) {
    return res.status(404).json({ error: 'Bundle or replacement file not found' });
  }

  try {
    // AdmZip replaces if entryName matches
    zip.addFile(targetPath, req.file.buffer);
    updateCurrentVersion(bundleId, zip, `Replaced ${targetPath}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to replace file' });
  }
});

// API: Add New File (Text or Binary)
app.post('/api/add-file', upload.single('file'), (req, res) => {
  const { bundleId, targetPath, textContent } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    let content: Buffer;
    if (req.file) {
      content = req.file.buffer;
    } else if (textContent) {
      content = Buffer.from(textContent, 'utf-8');
    } else {
      return res.status(400).json({ error: 'No content provided' });
    }

    zip.addFile(targetPath, content);
    updateCurrentVersion(bundleId, zip, `Added ${targetPath}`);
    
    // Refresh file list
    const entries = zip.getEntries().map(entry => ({
      name: entry.entryName,
      size: entry.header.size,
      isDirectory: entry.isDirectory
    }));

    res.json({ success: true, files: entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add file' });
  }
});

// API: Batch Delete Files
app.post('/api/batch-delete', (req, res) => {
  const { bundleId, filePaths } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ error: 'No files specified for deletion' });
    }

    filePaths.forEach(path => {
      try {
        zip.deleteFile(path);
      } catch (e) {
        console.warn(`Failed to delete ${path}:`, e);
      }
    });

    updateCurrentVersion(bundleId, zip, `Batch deleted ${filePaths.length} files`);
    
    const entries = zip.getEntries().map(entry => ({
      name: entry.entryName,
      size: entry.header.size,
      isDirectory: entry.isDirectory
    }));

    res.json({ success: true, files: entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Batch delete failed' });
  }
});

// API: Batch Export as ZIP
app.post('/api/batch-export', (req, res) => {
  const { bundleId, filePaths } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ error: 'No files specified for export' });
    }

    const exportZip = new AdmZip();
    filePaths.forEach(path => {
      const entry = zip.getEntry(path);
      if (entry && !entry.isDirectory) {
        exportZip.addFile(path, entry.getData());
      }
    });

    const buffer = exportZip.toBuffer();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="exported_files.zip"`,
      'Content-Length': buffer.length
    });
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Batch export failed' });
  }
});

// API: Save Metadata (Tokens/DUNS)
app.post('/api/metadata', async (req, res) => {
  const { bundleId, token, duns, companyName } = req.body;
  
  if (!isFirestoreActive || !db) {
    return res.status(503).json({ error: 'Storage service unavailable (Firestore not active)' });
  }

  try {
    const docRef = db.collection('bundles').doc(bundleId || 'global').collection('tokens').doc();
    await docRef.set({
      bundleId,
      token,
      duns,
      companyName,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save metadata' });
  }
});

// API: Get Metadata
app.get('/api/metadata/:bundleId', async (req, res) => {
  if (!isFirestoreActive || !db) {
    return res.json({ error: 'Storage unavailable' });
  }

  try {
    const snapshot = await db.collection('bundles').doc(req.params.bundleId).collection('tokens').orderBy('createdAt', 'desc').limit(1).get();
    if (snapshot.empty) {
      return res.json({});
    }
    res.json(snapshot.docs[0].data());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// API: Deep Audit
app.post('/api/audit', async (req, res) => {
  const { bundleId } = req.body;
  const zip = getCurrentZip(bundleId);

  if (!zip) return res.status(404).json({ error: 'Bundle not found' });

  try {
    const entries = zip.getEntries();
    const manifestEntry = entries.find(e => e.entryName.includes('AndroidManifest.xml'));
    const resEntries = entries.filter(e => e.entryName.includes('base/res/values-'));
    
    // Check Framework
    let framework = 'Native (Java/Kotlin)';
    if (entries.some(e => e.entryName.includes('libflutter.so') || e.entryName.includes('AssetIndex.json'))) {
      framework = 'Flutter';
    } else if (entries.some(e => e.entryName.includes('libreactnative') || e.entryName.includes('index.android.bundle'))) {
      framework = 'React Native';
    } else if (entries.some(e => e.entryName.includes('libunity.so'))) {
      framework = 'Unity';
    } else if (entries.some(e => e.entryName.includes('libxamarin') || e.entryName.includes('mscorlib.dll'))) {
      framework = 'Xamarin/MAUI';
    }

    const auditReport = {
      sdk: { target: 'Unknown', min: 'Unknown', status: 'Warning' as 'Success' | 'Warning' | 'Critical' },
      appInfo: { package: 'Unknown', versionCode: '0', versionName: '1.0.0', label: 'App', framework },
      manifestIssues: [] as { type: string, severity: 'Warning' | 'Critical', message: string, suggestion: string }[],
      localization: { count: 0, status: 'Info' },
      integrityToken: { status: 'Missing', message: 'No token found in metadata.' },
      score: 100
    };

    // Metadata Audit (Play Integrity)
    if (db && isFirestoreActive) {
      const metadataSnap = await db.collection('bundles').doc(bundleId).collection('tokens').orderBy('createdAt', 'desc').limit(1).get();
      if (!metadataSnap.empty) {
        const data = metadataSnap.docs[0].data();
        const token = data.token;
        
        if (token && token.length > 20) {
          const isJwsFormat = token.startsWith('eyJ') || /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*$/.test(token);
          
          if (token.length < 100) {
            auditReport.integrityToken = { status: 'Warning', message: 'Token appears too short for a production Play Integrity verdict.' };
            auditReport.score -= 5;
          } else if (isJwsFormat) {
            auditReport.integrityToken = { status: 'Valid', message: 'Token format matches standard JWS (Play Integrity API).' };
          } else {
            auditReport.integrityToken = { status: 'Invalid', message: 'Token format is unrecognized.' };
            auditReport.score -= 10;
          }
        } else if (token) {
          auditReport.integrityToken = { status: 'Invalid', message: 'Token is too short or malformed.' };
          auditReport.score -= 15;
        }
      }
    }

    if (manifestEntry) {
      const content = manifestEntry.getData().toString('utf8');
      
      const packageMatch = content.match(/package="([^"]+)"/);
      const vCodeMatch = content.match(/android:versionCode="([^"]+)"/);
      const vNameMatch = content.match(/android:versionName="([^"]+)"/);
      
      if (packageMatch) auditReport.appInfo.package = packageMatch[1];
      if (vCodeMatch) auditReport.appInfo.versionCode = vCodeMatch[1];
      if (vNameMatch) auditReport.appInfo.versionName = vNameMatch[1];

      const targetMatch = content.match(/android:targetSdkVersion="(\d+)"/);
      const minMatch = content.match(/android:minSdkVersion="(\d+)"/);
      
      if (targetMatch) {
        auditReport.sdk.target = targetMatch[1];
        const targetInt = parseInt(targetMatch[1]);
        if (targetInt < 34) {
          auditReport.sdk.status = 'Critical';
          auditReport.score -= 20;
          auditReport.manifestIssues.push({
            type: 'SDK Level',
            severity: 'Critical',
            message: `Target SDK (${targetInt}) is below Google Play's required level (API 34).`,
            suggestion: 'Update android:targetSdkVersion="34" in the manifest.'
          });
        } else {
          auditReport.sdk.status = 'Success';
        }
      }

      if (minMatch) auditReport.sdk.min = minMatch[1];

      const components = content.match(/<(activity|service|receiver)[^>]*>([\s\S]*?)<\/\1>/g) || [];
      components.forEach(comp => {
        if (comp.includes('<intent-filter') && !comp.includes('android:exported=')) {
          auditReport.manifestIssues.push({
            type: 'Security',
            severity: 'Critical',
            message: 'Component has an intent-filter but is missing android:exported attribute (Required for API 31+).',
            suggestion: 'Add android:exported="true" or "false" to the component tag.'
          });
          auditReport.score -= 10;
        }
      });

      if (content.includes('android.permission.INTERNET')) {
        if (content.includes('android:usesCleartextTraffic="true"') || !content.includes('android:usesCleartextTraffic="false"')) {
           auditReport.manifestIssues.push({
            type: 'Security',
            severity: 'Warning',
            message: 'Cleartext traffic (HTTP) is potentially enabled. Apps should prefer HTTPS.',
            suggestion: 'Set android:usesCleartextTraffic="false" in the <application> tag or use an explicit Network Security Config.'
          });
          auditReport.score -= 5;
        }
      }

      const permissionsMatch = content.match(/<uses-permission[^>]+android:name="([^"]+)"[^>]*\/>/g) || [];
      const permNames = permissionsMatch.map(p => p.match(/android:name="([^"]+)"/)?.[1]).filter(Boolean) as string[];
      const uniquePerms = new Set();
      const duplicates = [];
      permNames.forEach(p => {
        if (uniquePerms.has(p)) duplicates.push(p);
        else uniquePerms.add(p);
      });

      if (duplicates.length > 0) {
        auditReport.manifestIssues.push({
          type: 'Resource',
          severity: 'Warning',
          message: `Found ${duplicates.length} redundant/duplicate permission declarations.`,
          suggestion: 'Remove duplicate <uses-permission> tags in AndroidManifest.xml.'
        });
        auditReport.score -= 2;
      }

      // Broad Permission Analysis
      const broadPermissions = [
        { name: 'android.permission.READ_EXTERNAL_STORAGE', alt: 'READ_MEDIA_IMAGES/VIDEO/AUDIO (API 33+) or Scoped Storage (MediaStore)' },
        { name: 'android.permission.WRITE_EXTERNAL_STORAGE', alt: 'Use internal storage or Scoped Storage (No permission needed for app-specific dirs)' },
        { name: 'android.permission.ACCESS_FINE_LOCATION', alt: 'ACCESS_COARSE_LOCATION (if precise location isn\'t critical)' },
        { name: 'android.permission.ACCESS_BACKGROUND_LOCATION', alt: 'Check if foreground location is sufficient; Play Store requires high justification' },
        { name: 'android.permission.MANAGE_EXTERNAL_STORAGE', alt: 'Scoped Storage (MediaStore API) is preferred for most apps' },
        { name: 'android.permission.QUERY_ALL_PACKAGES', alt: 'Use specific <queries> declarations for needed packages' },
        { name: 'android.permission.REQUEST_INSTALL_PACKAGES', alt: 'Limited Use Case (e.g., App Stores). Replaced by Session-based installs' },
        { name: 'android.permission.READ_SMS', alt: 'SMS Retriever API (doesn\'t require permissions for OTP)' },
        { name: 'android.permission.RECEIVE_SMS', alt: 'SMS Retriever API' },
        { name: 'android.permission.READ_PHONE_STATE', alt: 'READ_PHONE_NUMBERS (API 26+) or non-sensitive identifiers' },
        { name: 'android.permission.GET_ACCOUNTS', alt: 'Google Sign-In API or AccountManager without broad access' },
        { name: 'android.permission.READ_CONTACTS', alt: 'Contact Picker (Intent based) requires no permission for one-off picks' },
        { name: 'android.permission.READ_CALL_LOG', alt: 'Often rejected by Play Store unless core functionality' },
        { name: 'android.permission.SYSTEM_ALERT_WINDOW', alt: 'Use Bubbles or Foreground Services for overlays' }
      ];

      broadPermissions.forEach(bp => {
        if (permNames.includes(bp.name)) {
          auditReport.manifestIssues.push({
            type: 'Security (Broad Permission)',
            severity: 'Warning',
            message: `Broad permission detected: ${bp.name}.`,
            suggestion: `Consider using more specific alternative: ${bp.alt}.`
          });
          auditReport.score -= 3;
        }
      });

      // Advanced Static Analysis: Debuggable Build
      if (content.includes('android:debuggable="true"')) {
        auditReport.manifestIssues.push({
          type: 'Security (Release)',
          severity: 'Critical',
          message: 'Application is marked as debuggable. This will result in Play Store rejection.',
          suggestion: 'Remove android:debuggable="true" from the <application> tag.'
        });
        auditReport.score -= 25;
      }

      // Advanced Static Analysis: Launchable Activity
      if (!content.includes('android.intent.action.MAIN') || !content.includes('android.intent.category.LAUNCHER')) {
        auditReport.manifestIssues.push({
          type: 'Structure',
          severity: 'Critical',
          message: 'No launchable Main Activity detected. The app cannot be started by users.',
          suggestion: 'Ensure at least one Activity has MAIN action and LAUNCHER category intent-filters.'
        });
        auditReport.score -= 30;
      }

      // Advanced Static Analysis: Hardware Features
      const sensitiveFeatures = [
        { perm: 'android.permission.CAMERA', feature: 'android.hardware.camera' },
        { perm: 'android.permission.RECORD_AUDIO', feature: 'android.hardware.microphone' },
        { perm: 'android.permission.ACCESS_FINE_LOCATION', feature: 'android.hardware.location.gps' }
      ];

      sensitiveFeatures.forEach(sf => {
        if (permNames.includes(sf.perm) && !content.includes(sf.feature)) {
          auditReport.manifestIssues.push({
            type: 'Hardware Compliance',
            severity: 'Warning',
            message: `Permission ${sf.perm} is present but the corresponding feature ${sf.feature} is not declared.`,
            suggestion: `Add <uses-feature android:name="${sf.feature}" android:required="false" /> to clarify hardware requirements.`
          });
          auditReport.score -= 2;
        }
      });

      // Advanced Static Analysis: App Identity
      if (!content.includes('android:label') || !content.includes('android:icon')) {
        auditReport.manifestIssues.push({
          type: 'App Identity',
          severity: 'Critical',
          message: 'Application label or icon is missing in manifest.',
          suggestion: 'Ensure <application> tag has android:label and android:icon attributes.'
        });
        auditReport.score -= 15;
      }
      
      if (content.includes('android:exported="true"')) {
        const exportedItems = (content.match(/android:exported="true"/g) || []).length;
        if (exportedItems > 0) {
          auditReport.score -= 5;
        }
      }

      // XML standard schema and prefix/attribute typo verification
      const cleanContentForSchema = content.replace(/<!--[\s\S]*?-->/g, ''); // strip comments
      
      const VALID_TAGS = new Set([
        'manifest', 'uses-sdk', 'uses-permission', 'uses-permission-sdk-23',
        'permission', 'permission-group', 'permission-tree', 'uses-feature',
        'queries', 'package', 'intent', 'provider', 'supports-screens',
        'compatible-screens', 'supports-gl-texture', 'application', 'activity',
        'activity-alias', 'service', 'receiver', 'meta-data', 'intent-filter',
        'action', 'category', 'data', 'uses-library', 'library', 'property',
        'profileable', 'use-embedded-dex', 'nav-graph', 'static-library',
        'instrumentation'
      ]);

      const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
        manifest: new Set(['versionCode', 'versionName', 'sharedUserId', 'sharedUserLabel', 'installLocation', 'compileSdkVersion', 'compileSdkVersionCodename']),
        'uses-sdk': new Set(['minSdkVersion', 'targetSdkVersion', 'maxSdkVersion']),
        'uses-permission': new Set(['name', 'maxSdkVersion', 'required', 'requiredFeature', 'requiredNotFeature']),
        'uses-permission-sdk-23': new Set(['name', 'maxSdkVersion']),
        permission: new Set(['name', 'protectionLevel', 'label', 'description', 'permissionGroup', 'icon', 'roundIcon']),
        'permission-group': new Set(['name', 'label', 'description', 'icon', 'roundIcon', 'priority']),
        'uses-feature': new Set(['name', 'required', 'glEsVersion']),
        application: new Set([
          'allowBackup', 'allowClearUserData', 'allowAudioPlaybackCapture', 'appComponentFactory', 'backupAgent', 
          'backupInForeground', 'banner', 'cantSaveState', 'classLoader', 'crossProfile', 'debuggable', 
          'description', 'directBootAware', 'enabled', 'extractNativeLibs', 'fullBackupContent', 'fullBackupOnly', 
          'gwpAsanMode', 'hardwareAccelerated', 'hasCode', 'hasFragileUserData', 'icon', 'isGame', 'killAfterRestore', 
          'largeHeap', 'label', 'logo', 'manageSpaceActivity', 'name', 'networkSecurityConfig', 'permission', 
          'persistent', 'process', 'restoreAnyVersion', 'requestLegacyExternalStorage', 'requestRawExternalStorageBuf', 
          'resizeableActivity', 'restrictedDirectory', 'roundIcon', 'supportsRtl', 'taskAffinity', 'theme', 
          'usesCleartextTraffic', 'vmSafeMode', 'localeConfig', 'requestOptimizedExternalStorageAccess', 'dataExtractionRules'
        ]),
        activity: new Set([
          'allowEmbedded', 'allowTaskReparenting', 'alwaysRetainTaskState', 'autoRemoveFromRecents', 'banner', 
          'clearTaskOnLaunch', 'colorMode', 'configChanges', 'directBootAware', 'documentLaunchMode', 'enabled', 
          'excludeFromRecents', 'exported', 'finishOnTaskLaunch', 'hardwareAccelerated', 'icon', 'immersive', 
          'label', 'launchMode', 'lockTaskMode', 'logo', 'maxRecents', 'maxAspectRatio', 'multiprocess', 'name', 
          'noHistory', 'parentActivityName', 'permission', 'persistableMode', 'process', 'recreateOnConfigChanges', 
          'resizeableActivity', 'roundIcon', 'screenOrientation', 'showForAllUsers', 'stateNotNeeded', 
          'supportsPictureInPicture', 'taskAffinity', 'theme', 'uiOptions', 'windowSoftInputMode', 'visibleToInstantApps'
        ]),
        'activity-alias': new Set(['enabled', 'exported', 'icon', 'label', 'name', 'permission', 'roundIcon', 'targetActivity']),
        service: new Set(['description', 'directBootAware', 'enabled', 'exported', 'foregroundServiceType', 'icon', 'isolatedProcess', 'label', 'name', 'permission', 'process', 'roundIcon']),
        receiver: new Set(['directBootAware', 'enabled', 'exported', 'icon', 'label', 'name', 'permission', 'process']),
        provider: new Set([
          'authorities', 'directBootAware', 'enabled', 'exported', 'grantUriPermissions', 'icon', 'initOrder', 
          'label', 'multiprocess', 'name', 'permission', 'process', 'readPermission', 'syncable', 'writePermission'
        ]),
        'intent-filter': new Set(['icon', 'label', 'priority', 'roundIcon', 'order']),
        action: new Set(['name']),
        category: new Set(['name']),
        data: new Set(['scheme', 'host', 'port', 'path', 'pathPattern', 'pathPrefix', 'pathAdvancedPattern', 'mimeType', 'ssp', 'sspPattern', 'sspPrefix']),
        'meta-data': new Set(['name', 'value', 'resource']),
        property: new Set(['name', 'value', 'resource']),
        'uses-library': new Set(['name', 'required']),
        library: new Set(['name', 'version']),
        'static-library': new Set(['name', 'version']),
        queries: new Set([]),
        package: new Set(['name']),
        intent: new Set([])
      };

      const ALL_STANDARD_ANDROID_ATTRIBUTES = new Set([
        'versionCode', 'versionName', 'sharedUserId', 'sharedUserLabel', 'installLocation',
        'compileSdkVersion', 'compileSdkVersionCodename', 'minSdkVersion', 'targetSdkVersion',
        'maxSdkVersion', 'name', 'required', 'requiredFeature', 'requiredNotFeature',
        'protectionLevel', 'label', 'description', 'permissionGroup', 'icon', 'roundIcon',
        'priority', 'glEsVersion', 'allowBackup', 'allowClearUserData', 'allowAudioPlaybackCapture',
        'appComponentFactory', 'backupAgent', 'backupInForeground', 'banner', 'cantSaveState',
        'classLoader', 'crossProfile', 'debuggable', 'directBootAware', 'enabled', 'extractNativeLibs',
        'fullBackupContent', 'fullBackupOnly', 'gwpAsanMode', 'hardwareAccelerated', 'hasCode',
        'hasFragileUserData', 'logo', 'manageSpaceActivity', 'networkSecurityConfig', 'permission',
        'persistent', 'process', 'restoreAnyVersion', 'requestLegacyExternalStorage', 'requestRawExternalStorageBuf',
        'resizeableActivity', 'restrictedDirectory', 'supportsRtl', 'taskAffinity', 'theme',
        'usesCleartextTraffic', 'vmSafeMode', 'localeConfig', 'requestOptimizedExternalStorageAccess',
        'dataExtractionRules', 'allowEmbedded', 'allowTaskReparenting', 'alwaysRetainTaskState',
        'autoRemoveFromRecents', 'clearTaskOnLaunch', 'colorMode', 'configChanges', 'documentLaunchMode',
        'excludeFromRecents', 'exported', 'finishOnTaskLaunch', 'immersive', 'launchMode', 'lockTaskMode',
        'maxRecents', 'maxAspectRatio', 'multiprocess', 'noHistory', 'parentActivityName', 'persistableMode',
        'recreateOnConfigChanges', 'screenOrientation', 'showForAllUsers', 'stateNotNeeded',
        'supportsPictureInPicture', 'uiOptions', 'windowSoftInputMode', 'visibleToInstantApps',
        'targetActivity', 'foregroundServiceType', 'isolatedProcess', 'authorities', 'grantUriPermissions',
        'initOrder', 'readPermission', 'syncable', 'writePermission', 'order', 'scheme', 'host',
        'port', 'path', 'pathPattern', 'pathPrefix', 'pathAdvancedPattern', 'mimeType', 'ssp',
        'sspPattern', 'sspPrefix', 'value', 'resource', 'version', 'node', 'replace', 'ignore', 'targetApi'
      ]);

      const getLevenshteinDistance = (a: string, b: string): number => {
        const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
          for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
              matrix[i][j] = matrix[i - 1][j - 1];
            } else {
              matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + 1
              );
            }
          }
        }
        return matrix[a.length][b.length];
      };

      const findClosestMatch = (attr: string, pool: Set<string> | Iterable<string>): string => {
        let bestMatch = '';
        let minDistance = 999;
        for (const item of pool) {
          const d = getLevenshteinDistance(attr, item);
          if (d < minDistance) {
            minDistance = d;
            bestMatch = item;
          }
        }
        return minDistance <= 3 ? bestMatch : '';
      };

      const tagRegex = /<([a-zA-Z0-9_\-]+)([^>]*)\/?>/g;
      const attrRegex = /([a-zA-Z0-9_\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

      let tagMatch;
      while ((tagMatch = tagRegex.exec(cleanContentForSchema)) !== null) {
        const tagName = tagMatch[1];
        const rawAttrs = tagMatch[2];

        if (!VALID_TAGS.has(tagName) && !tagName.includes('.')) { 
          auditReport.manifestIssues.push({
            type: 'Schema (Tag Name)',
            severity: 'Warning',
            message: `Non-standard XML tag found: <${tagName}> in AndroidManifest.xml.`,
            suggestion: `Ensure the element name is correct and supported by the Android SDK.`
          });
          auditReport.score -= 2;
          continue;
        }

        let attrMatch;
        attrRegex.lastIndex = 0;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          const attrName = attrMatch[1];
          if (attrName.startsWith('xmlns:') || attrName === 'xmlns') continue;

          if (attrName.includes(':')) {
            const [prefix, rawAttr] = attrName.split(':');
            
            if (prefix.toLowerCase() !== 'android' && prefix.toLowerCase() !== 'tools' && prefix.toLowerCase() !== 'dist' && prefix.toLowerCase() !== 'app') {
              const closestPrefix = findClosestMatch(prefix.toLowerCase(), ['android', 'tools', 'dist', 'app']);
              auditReport.manifestIssues.push({
                type: 'Schema (Namespace Prefix)',
                severity: 'Critical',
                message: `Typo or unrecognized XML prefix "${prefix}" in attribute "${attrName}" for element <${tagName}>.`,
                suggestion: closestPrefix ? `Change prefix to "${closestPrefix}" (e.g., "${closestPrefix}:${rawAttr}").` : `Verify that dynamic namespaces are declared correctly.`
              });
              auditReport.score -= 5;
            } else if (prefix.toLowerCase() === 'android') {
              const attrSet = ELEMENT_ATTRIBUTES[tagName];
              const isTagKnownAttr = attrSet && attrSet.has(rawAttr);
              const isGlobalKnownAttr = ALL_STANDARD_ANDROID_ATTRIBUTES.has(rawAttr);

              if (!isTagKnownAttr && !isGlobalKnownAttr) {
                const pool = attrSet ? new Set([...attrSet, ...ALL_STANDARD_ANDROID_ATTRIBUTES]) : ALL_STANDARD_ANDROID_ATTRIBUTES;
                const suggestionAttr = findClosestMatch(rawAttr, pool);
                
                auditReport.manifestIssues.push({
                  type: 'Schema (Attribute)',
                  severity: 'Warning',
                  message: `Invalid or non-standard Android attribute "android:${rawAttr}" in <${tagName}>.`,
                  suggestion: suggestionAttr ? `Did you mean "android:${suggestionAttr}"?` : `Check the spelling of "android:${rawAttr}" against the official Android SDK.`
                });
                auditReport.score -= 2;
              }
            }
          } else {
            const allowedPlain = tagName === 'manifest' ? new Set(['package']) : new Set();
            if (!allowedPlain.has(attrName)) {
              if (ALL_STANDARD_ANDROID_ATTRIBUTES.has(attrName)) {
                auditReport.manifestIssues.push({
                  type: 'Schema (Missing Prefix)',
                  severity: 'Critical',
                  message: `Attribute "${attrName}" for <${tagName}> is missing "android:" prefix namespace.`,
                  suggestion: `Change "${attrName}" to "android:${attrName}".`
                });
                auditReport.score -= 5;
              } else {
                auditReport.manifestIssues.push({
                  type: 'Schema (Attribute Unprefixed)',
                  severity: 'Warning',
                  message: `Unprefixed or invalid attribute "${attrName}" in <${tagName}>.`,
                  suggestion: `Unprefixed attributes (besides "package" on <manifest>) are ignored by the Android compiler.`
                });
                auditReport.score -= 2;
              }
            }
          }
        }
      }
    }

    auditReport.localization.count = [...new Set(resEntries.map(e => e.entryName.split('/')[2]))].length;
    if (auditReport.localization.count < 3) {
      auditReport.score -= 5;
    }

    // Advanced Static Analysis: Large Assets
    const largeAssets = entries.filter(e => (e.entryName.includes('base/assets/') || e.entryName.includes('base/res/raw/')) && e.header.size > 50 * 1024 * 1024);
    if (largeAssets.length > 0) {
      auditReport.manifestIssues.push({
        type: 'Optimization',
        severity: 'Warning',
        message: `Found ${largeAssets.length} assets over 50MB. Large assets can impact Play Store distribution and installation time.`,
        suggestion: 'Consider using Play Asset Delivery (PAD) for large data files.'
      });
      auditReport.score -= 5;
    }

    // Advanced Static Analysis: ABI Coverage
    const libEntries = entries.filter(e => e.entryName.startsWith('base/lib/'));
    if (libEntries.length > 0) {
      const abis = new Set(libEntries.map(e => e.entryName.split('/')[2]));
      if (!abis.has('arm64-v8a') && !abis.has('armeabi-v7a')) {
        auditReport.manifestIssues.push({
          type: 'Architecture',
          severity: 'Critical',
          message: 'Missing standard ARM ABI libraries. The app may not run on most Android devices.',
          suggestion: 'Ensure libraries for arm64-v8a and armeabi-v7a are included in the bundle.'
        });
        auditReport.score -= 20;
      } else if (!abis.has('arm64-v8a')) {
        auditReport.manifestIssues.push({
          type: 'Architecture',
          severity: 'Warning',
          message: 'Missing 64-bit ARM (arm64-v8a) libraries. Google Play requires 64-bit support.',
          suggestion: 'Include 64-bit native libraries to comply with Play Store policies.'
        });
        auditReport.score -= 10;
      }
    }

    // Resource Analysis: String Duplication & Translation
    const defaultStringsEntry = entries.find(e => e.entryName === 'base/res/values/strings.xml');
    const localizedStringsEntries = entries.filter(e => e.entryName.includes('/res/values-') && e.entryName.endsWith('/strings.xml'));
    
    if (defaultStringsEntry) {
      const content = defaultStringsEntry.getData().toString('utf8');
      const stringKeys = (content.match(/name="([^"]+)"/g) || []).map(m => m.match(/"([^"]+)"/)?.[1] || '');
      
      const duplicates = stringKeys.filter((key, index) => stringKeys.indexOf(key) !== index);
      if (duplicates.length > 0) {
        auditReport.manifestIssues.push({
          type: 'Resource (Strings)',
          severity: 'Warning',
          message: `Found ${duplicates.length} duplicate string keys in default strings.xml.`,
          suggestion: 'Consolidate duplicate keys to avoid resource conflicts.'
        });
        auditReport.score -= 2;
      }

      localizedStringsEntries.forEach(le => {
        const localContent = le.getData().toString('utf8');
        const localStringsMap = new Map();
        const stringMatches = localContent.matchAll(/name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g);
        for (const match of stringMatches) {
          localStringsMap.set(match[1], match[2].trim());
        }

        const missingKeys = stringKeys.filter(k => !localStringsMap.has(k));
        const emptyKeys = stringKeys.filter(k => localStringsMap.has(k) && localStringsMap.get(k) === '');
        
        const missingCount = missingKeys.length;
        const totalIssueCount = missingCount + emptyKeys.length;
        
        if (totalIssueCount > 0 && stringKeys.length > 0) {
          const locale = le.entryName.split('/')[2].replace('values-', '');
          const percent = Math.round((totalIssueCount / stringKeys.length) * 100);
          
          if (percent > 5) {
            const sampleMissing = missingKeys.slice(0, 10).join(', ');
            const sampleEmpty = emptyKeys.slice(0, 5).join(', ');
            
            let detailedMsg = `Locale '${locale}' (values-${locale}) has ${totalIssueCount} issues (${percent}% incomplete).`;
            if (missingCount > 0) detailedMsg += ` Missing: ${missingCount} keys.`;
            if (emptyKeys.length > 0) detailedMsg += ` Empty: ${emptyKeys.length} keys.`;

            auditReport.manifestIssues.push({
              type: 'Localization',
              severity: 'Warning',
              message: detailedMsg,
              suggestion: `Specific issues in ${locale}: ${missingCount > 0 ? `[Missing]: ${sampleMissing}${missingCount > 10 ? '...' : ''}` : ''} ${emptyKeys.length > 0 ? `[Empty]: ${sampleEmpty}${emptyKeys.length > 5 ? '...' : ''}` : ''}. Accurate translations are critical.`
            });
            auditReport.score -= 1;
          }
        }
      });
    }

    // Resource Analysis: Image Optimization
    const drawableEntries = entries.filter(e => e.entryName.includes('/res/drawable') && /\.(png|jpg|jpeg)$/i.test(e.entryName));
    
    drawableEntries.forEach(img => {
      if (img.header.size > 200 * 1024) { // Lowered threshold to 200KB for specific warning
        const ext = img.entryName.split('.').pop()?.toUpperCase();
        const isVeryLarge = img.header.size > 1024 * 1024;
        
        auditReport.manifestIssues.push({
          type: 'Optimization (Images)',
          severity: isVeryLarge ? 'Critical' : 'Warning',
          message: `Heavy ${ext} asset found: ${img.entryName.split('/').pop()} (${(img.header.size / 1024).toFixed(1)}KB).`,
          suggestion: `Convert this ${ext} to WebP format to reduce bundle size by ~30-70%.`
        });
        auditReport.score -= isVeryLarge ? 5 : 2;
      }
    });

    auditReport.score = Math.max(0, auditReport.score);
    res.json(auditReport);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Audit failed' });
  }
});

// API: Version Control - Get History
app.get('/api/version/history/:bundleId', (req, res) => {
  const state = activeBundles.get(req.params.bundleId);
  if (!state) return res.status(404).json({ error: 'Bundle not found' });
  
  res.json({
    currentIndex: state.currentIndex,
    history: state.versions.map((v, i) => ({
      index: i,
      label: v.label,
      timestamp: v.timestamp
    }))
  });
});

// API: Version Control - Restore
app.post('/api/version/restore', (req, res) => {
  const { bundleId, index } = req.body;
  const state = activeBundles.get(bundleId);
  if (!state) return res.status(404).json({ error: 'Bundle not found' });
  
  if (index < 0 || index >= state.versions.length) {
    return res.status(400).json({ error: 'Invalid version index' });
  }
  
  state.currentIndex = index;
  const zip = new AdmZip(state.versions[index].buffer);
  
  const entries = zip.getEntries().map(entry => ({
    name: entry.entryName,
    size: entry.header.size,
    isDirectory: entry.isDirectory
  }));
  
  res.json({ success: true, files: entries });
});

// API: Save AAB back to Workspace files
app.post('/api/save-to-workspace', (req, res) => {
  const { bundleId, filename } = req.body;
  const state = activeBundles.get(bundleId);
  if (!state) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    const buffer = state.versions[state.currentIndex].buffer;
    const targetFilename = filename || `edited-${state.name}`;
    
    // Ensure filename does not allow path traversal
    const safeFilename = path.basename(targetFilename);
    const filePath = path.join(process.cwd(), safeFilename);
    
    fs.writeFileSync(filePath, buffer);
    
    res.json({ 
      success: true, 
      message: `Successfully saved ${safeFilename} to workspace project files!`,
      filename: safeFilename,
      size: buffer.length
    });
  } catch (err: any) {
    console.error('Save to workspace error:', err);
    res.status(500).json({ error: err.message || 'Failed to save file to workspace' });
  }
});

// API: Download AAB
app.get('/api/download/:bundleId', (req, res) => {
  const state = activeBundles.get(req.params.bundleId);
  if (!state) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  try {
    const buffer = state.versions[state.currentIndex].buffer;
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="edited-${state.name}"`,
      'Content-Length': buffer.length
    });
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate AAB' });
  }
});

// Vite middleware
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
