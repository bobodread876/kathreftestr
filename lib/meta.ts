// Best-effort source metadata for proper attribution. YouTube oEmbed gives the
// real video title + channel name + channel URL with no API key and works for
// live streams; the thumbnail comes from the video id. Twitch falls back to the
// channel slug. Everything degrades gracefully — a failed fetch just yields {}.

export interface StreamMeta {
  title?: string;
  uploader?: string;
  uploaderUrl?: string;
  thumbnail?: string;
}

function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/|youtube\.com\/v\/)([^#&?/]+)/);
  return m ? m[1] : null;
}

export async function fetchStreamMeta(url: string): Promise<StreamMeta> {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu")) {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; Kathreftestr/1.0)" }, signal: AbortSignal.timeout(6000) },
      );
      if (res.ok) {
        const d = await res.json();
        const id = youTubeId(url);
        return {
          title: d.title || undefined,
          uploader: d.author_name || undefined,
          uploaderUrl: d.author_url || undefined,
          thumbnail: d.thumbnail_url || (id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : undefined),
        };
      }
    } else if (u.hostname.includes("twitch.tv")) {
      const chan = u.pathname.split("/").filter(Boolean)[0];
      if (chan) return { uploader: chan, uploaderUrl: `https://twitch.tv/${chan}` };
    }
  } catch {
    // best effort
  }
  return {};
}
