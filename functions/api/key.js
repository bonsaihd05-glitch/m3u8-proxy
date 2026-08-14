export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const streamUrl = url.searchParams.get('url');
  if (!streamUrl) {
    return new Response('Missing "url" parameter', { status: 400, headers: corsHeaders });
  }

  try {
    const decodedUrl = decodeURIComponent(streamUrl);
    const targetUrl = new URL(decodedUrl);
    const queryString = targetUrl.search;

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Origin': targetUrl.origin,
        'Referer': `${targetUrl.origin}/`
      }
    });

    if (!response.ok) {
      return new Response(`Akamai Error: ${response.status} (${response.statusText})`, {
        status: response.status,
        headers: corsHeaders
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = decodedUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('text/plain');

    if (isM3U8) {
      const manifestText = await response.text();
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);
      const proxyBase = `${url.origin}${url.pathname}?url=`;

      const lines = manifestText.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Key রিরাইট
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            let absolute = p1.startsWith('http') ? p1 : new URL(p1, baseUrl).href;
            if (queryString && !absolute.includes('?')) absolute += queryString;
            return `URI="${proxyBase}${encodeURIComponent(absolute)}"`;
          });
        }

        // সেগমেন্ট ও চাইল্ড প্লেলিস্ট (.ts, .m4s) রিরাইট
        if (!trimmed.startsWith('#')) {
          let absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
          if (queryString && !absolute.includes('?')) absolute += queryString;
          return `${proxyBase}${encodeURIComponent(absolute)}`;
        }

        return line;
      });

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store'
        }
      });
    }

    // মিডিয়া ডাটা
    const responseHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => responseHeaders.set(key, corsHeaders[key]));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response(`Proxy Error: ${error.message}`, {
      status: 500,
      headers: corsHeaders
    });
  }
}
