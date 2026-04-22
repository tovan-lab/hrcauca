import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Given a stored image URL (which may be a now-expired public URL or signed URL),
 * extract the storage path and generate a fresh signed URL.
 */
export async function getSignedImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  // If it's a data URL, return as-is
  if (imageUrl.startsWith('data:')) return imageUrl;

  // Check cache
  const cached = cache.get(imageUrl);
  if (cached && cached.expires > Date.now()) return cached.url;

  // Extract path from storage URL
  const match = imageUrl.match(/checkin-images\/(.+?)(\?|$)/);
  if (!match) return imageUrl; // Not a storage URL

  const path = decodeURIComponent(match[1]);
  const { data } = await supabase.storage
    .from('checkin-images')
    .createSignedUrl(path, 300); // 5 minutes

  if (data?.signedUrl) {
    cache.set(imageUrl, { url: data.signedUrl, expires: Date.now() + 270000 }); // cache 4.5 min
    return data.signedUrl;
  }
  return imageUrl;
}

/**
 * Batch resolve signed URLs for multiple image URLs.
 */
export async function getSignedImageUrls(imageUrls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toResolve: { original: string; path: string }[] = [];

  for (const url of imageUrls) {
    if (!url || url.startsWith('data:')) {
      result.set(url, url);
      continue;
    }
    const cached = cache.get(url);
    if (cached && cached.expires > Date.now()) {
      result.set(url, cached.url);
      continue;
    }
    const match = url.match(/checkin-images\/(.+?)(\?|$)/);
    if (!match) {
      result.set(url, url);
      continue;
    }
    toResolve.push({ original: url, path: decodeURIComponent(match[1]) });
  }

  if (toResolve.length > 0) {
    const { data } = await supabase.storage
      .from('checkin-images')
      .createSignedUrls(toResolve.map(r => r.path), 300);

    if (data) {
      data.forEach((item, idx) => {
        const original = toResolve[idx].original;
        const signedUrl = item.signedUrl || original;
        cache.set(original, { url: signedUrl, expires: Date.now() + 270000 });
        result.set(original, signedUrl);
      });
    } else {
      toResolve.forEach(r => result.set(r.original, r.original));
    }
  }

  return result;
}

/**
 * React hook: resolve a single image URL to a signed URL.
 */
export function useSignedUrl(imageUrl: string | undefined | null): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!imageUrl) { setUrl(''); return; }
    let cancelled = false;
    getSignedImageUrl(imageUrl).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [imageUrl]);

  return url;
}
