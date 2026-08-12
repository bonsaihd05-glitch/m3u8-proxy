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

    // রিকোয়েস্ট পাঠানোর সময় মূল সার্ভারের অরিজিন ও রিফারার পাঠানো
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
