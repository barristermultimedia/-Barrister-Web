// Storage layer. On Netlify this is Netlify Blobs (no setup needed).
// For local testing set LOCAL_STORE_DIR to use plain files instead.
import fs from 'node:fs/promises';
import path from 'node:path';

export function store(name) {
  return process.env.LOCAL_STORE_DIR ? fileStore(name) : blobStore(name);
}

function blobStore(name) {
  let s;
  const open = async () => {
    if (!s) {
      const { getStore } = await import('@netlify/blobs');
      s = getStore({ name, consistency: 'strong' });
    }
    return s;
  };
  return {
    async get(key) { return (await (await open()).get(key, { type: 'json' })) ?? null; },
    async set(key, value) { await (await open()).setJSON(key, value); },
    async delete(key) { await (await open()).delete(key); },
    async list(prefix = '') {
      const { blobs } = await (await open()).list({ prefix });
      return blobs.map((b) => b.key).sort();
    },
  };
}

function fileStore(name) {
  const dir = path.join(process.env.LOCAL_STORE_DIR, name);
  const file = (key) => path.join(dir, encodeURIComponent(key) + '.json');
  return {
    async get(key) {
      try { return JSON.parse(await fs.readFile(file(key), 'utf8')); } catch { return null; }
    },
    async set(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(value));
    },
    async delete(key) { try { await fs.unlink(file(key)); } catch { /* already gone */ } },
    async list(prefix = '') {
      let names = [];
      try { names = await fs.readdir(dir); } catch { return []; }
      return names.filter((n) => n.endsWith('.json')).map((n) => decodeURIComponent(n.slice(0, -5))).filter((k) => k.startsWith(prefix)).sort();
    },
  };
}
