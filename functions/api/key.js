export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // ১. ইউনিভার্সাল CORS হেডার
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
      JSON.stringify({ error: 'Missing "url" parameter. Usage: /api/key?url=YOUR_STREAM_URL' }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const decodedUrl = decodeURIComponent(streamUrl);
    const targetUrl = new URL(decodedUrl);

    // ২. স্মার্ট হেডার তৈরি (স্মার্ট রিকুয়েস্ট স্পুফিং)
    let requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': targetUrl.origin,
      'Referer': `${targetUrl.origin}/`,
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    };

    // কাস্টম হেডার পাঠালে তা রিকুয়েস্টে যুক্ত করবে
    const customHeadersParam = url.searchParams.get('headers');
    if (customHeadersParam) {
      try {
        const parsedHeaders = JSON.parse(decodeURIComponent(customHeadersParam));
        Object.assign(requestHeaders, parsedHeaders);
      } catch (e) {
        // হেডার পার্স না হলে আগেরটিই থাকবে
      }
    }

    // ৩. মূল স্ট্রিম সার্ভারে রিকোয়েস্ট পাঠানো
    const response = await fetch(decodedUrl, {
      method: request.method,
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

    // ৪. M3U8 প্লেলিস্ট রিরাইট লজিক (TS/M4S/Key প্রক্সি করা)
    if (isM3U8) {
      let manifestText = await response.text();
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);

      let passHeaders = customHeadersParam ? `&headers=${encodeURIComponent(customHeadersParam)}` : '';
      const proxyBase = `${url.origin}${url.pathname}?url=`;

      const lines = manifestText.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // AES-128 Key রিরাইট
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absolute = p1.startsWith('http') ? p1 : new URL(p1, baseUrl).href;
            return `URI="${proxyBase}${encodeURIComponent(absolute)}${passHeaders}"`;
          });
        }

        // চাইল্ড প্লেলিস্ট ও ভিডিও সেগমেন্ট (.ts, .m4s, .aac ইত্যাদি)
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

    // ৫. ভিডিও সেগমেন্ট বা বাইনারি রেসপন্স সরাসরি পাস করা
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
