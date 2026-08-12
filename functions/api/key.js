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
    return new Response(
      JSON.stringify({ error: 'Missing "url" parameter' }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const decodedUrl = decodeURIComponent(streamUrl);
    const targetUrl = new URL(decodedUrl);

    const response = await fetch(decodedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': targetUrl.origin,
        'Referer': targetUrl.origin + '/'
      }
    });

    if (!response.ok) {
      return new Response(`Failed to load stream: ${response.statusText}`, {
        status: response.status,
        headers: corsHeaders
      });
    }

    const contentType = response.headers.get('content-type') || '';
    
    // m3u8 প্লেলিস্ট হলে ভেতরের সব ইউআরএল প্রক্সিতে রিরাইট করা
    if (decodedUrl.includes('.m3u8') || contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('text/plain')) {
      let manifestText = await response.text();
      const baseUrl = decodedUrl.substring(0, decodedUrl.lastIndexOf('/') + 1);

      const proxyBase = `${url.origin}${url.pathname}?url=`;

      // ফাইল পাথ রিরাইট করার লজিক
      const lines = manifestText.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // URI= "..." সমৃদ্ধ লাইন (যেমন Key ফাইল)
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
            const absolute = p1.startsWith('http') ? p1 : new URL(p1, baseUrl).href;
            return `URI="${proxyBase}${encodeURIComponent(absolute)}"`;
          });
        }

        // সাধারণ সেগমেন্ট ও চাইল্ড প্লেলিস্ট (.ts, .m3u8, .m4s ইত্যাদি)
        if (!trimmed.startsWith('#')) {
          const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
          return `${proxyBase}${encodeURIComponent(absolute)}`;
        }

        return line;
      });

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache'
        }
      });
    }

    // TS বা অন্যান্য মিডিয়া ফাইলের ক্ষেত্রে বাইনারি স্ট্রিম পাঠানো
    const newHeaders = new Headers(response.headers);
    Object.keys(corsHeaders).forEach(key => newHeaders.set(key, corsHeaders[key]));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
