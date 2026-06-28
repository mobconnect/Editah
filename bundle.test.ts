import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

describe('AAB (ZIP) Manipulation', () => {
  it('should create a valid ZIP and add files to it', () => {
    const zip = new AdmZip();
    zip.addFile('base/assets/test.txt', Buffer.from('hello world', 'utf-8'));
    
    const buffer = zip.toBuffer();
    const readZip = new AdmZip(buffer);
    const entry = readZip.getEntry('base/assets/test.txt');
    
    expect(entry).toBeDefined();
    expect(entry?.getData().toString('utf-8')).toBe('hello world');
  });

  it('should replace an existing file', () => {
    const zip = new AdmZip();
    zip.addFile('manifest.xml', Buffer.from('<old>', 'utf-8'));
    
    // Replace logic used in server.ts
    zip.addFile('manifest.xml', Buffer.from('<new>', 'utf-8'));
    
    const buffer = zip.toBuffer();
    const readZip = new AdmZip(buffer);
    const entries = readZip.getEntries();
    
    // Ensure it didn't create a duplicate but replaced the content
    // Note: AdmZip often adds a new entry if not careful, but usually we handle it by name
    const matches = entries.filter(e => e.entryName === 'manifest.xml');
    expect(matches.length).toBe(1);
    expect(matches[0].getData().toString('utf-8')).toBe('<new>');
  });

  it('should handle complex paths', () => {
    const zip = new AdmZip();
    const path = 'base/res/drawable-hdpi/icon.png';
    zip.addFile(path, Buffer.from('binary-data'));
    
    expect(zip.getEntry(path)).toBeDefined();
  });
});
