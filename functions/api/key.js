export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const streamUrl = url.searchParams.get('url');
  if (!streamUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing "url" parameter.' }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const decodedUrl = decodeURIComponent(streamUrl);
    const targetUrl = new URL(decodedUrl);

    // ডিফল্ট ব্রাউজার হেডার
    let requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    // কাস্টম হেডার থাকলে তা রিড করা
    const customHeadersParam = url.searchParams.get('headers');
    let hasCustomReferer = false;

    if (customHeadersParam) {
      try {
        const parsedHeaders = JSON.parse(decodeURIComponent(customHeadersParam));
        Object.keys(parsedHeaders).forEach(key => {
          requestHeaders[key] = parsedHeaders[key];
          if (key.toLowerCase() === 'referer') hasCustomReferer = true;
        });
      } catch (e) {}
    }

    // আলাদাভাবে &referer= প্যারামিটার পাঠালেও তা ধরবে
    const directReferer = url.searchParams.get('referer');
    if (directReferer) {
      requestHeaders['Referer'] = decodeURIComponent(directReferer);
      hasCustomReferer = true;
    }

    // যদি কোনো Referer না দেওয়া থাকে তবে Target URL Origin ব্যবহার করবে
    if (!hasCustomReferer) {
      requestHeaders['Origin'] = targetUrl.origin;
      requestHeaders['Referer'] = `${targetUrl.origin}/`;
    }

    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: requestHeaders
    });

    if (!response.ok) {
      return new Response(`Proxy Error: Server responded with status ${response.status} (${response.statusText})`, {
        status: response.status,
        headers: corsHeaders
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = decodedUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('apple') || contentType.includes('text/plain');

    if (isM3U8) {
      let manifestText = await response.text();
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);

      let passHeaders = '';
      if (customHeadersParam) passHeaders += `&headers=${encodeURIComponent(customHeadersParam)}`;
      if (directReferer) passHeaders += `&referer=${encodeURIComponent(directReferer)}`;

      const proxyBase = `${url.origin}${url.pathname}?url=`;

      const lines = manifestText.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absolute = p1.startsWith('http') ? p1 : new URL(p1, baseUrl).href;
            return `URI="${proxyBase}${encodeURIComponent(absolute)}${passHeaders}"`;
          });
        }

        if (!trimmed.startsWith('#')) {
          const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
          return `${proxyBase}${encodeURIComponent(absolute)}${passHeaders}`;
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

    const responseHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => responseHeaders.set(key, corsHeaders[key]));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
