// YouTube utility functions

function extractYouTubeVideoId(url) {
  if (!url) return null;
  
  // Various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^#&?]*)/,
    /^([^#&?]*)/  // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

function getYouTubeThumbnail(url, quality = 'maxresdefault') {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  
  // YouTube thumbnail qualities:
  // - maxresdefault (1280x720)
  // - sddefault (640x480)
  // - hqdefault (480x360)
  // - mqdefault (320x180)
  // - default (120x90)
  
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

function getYouTubeTitle(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  
  // Note: Getting the actual title requires API access or web scraping
  // For now, we'll return null and let the user provide the title
  return null;
}

module.exports = {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  getYouTubeTitle
};