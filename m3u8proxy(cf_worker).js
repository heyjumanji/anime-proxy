addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/m3u8-proxy") {
    return handleM3U8Proxy(request);
  } else if (url.pathname === "/ts-proxy") {
    return handleTsProxy(request);
  }

  return new Response("Not Found", { status: 404 });
}

const allowedOrigins = typeof ALLOWED_ORIGINS !== "undefined" ? ALLOWED_ORIGINS.split(",") : ["*"];

const options = {
  originBlacklist: [],
  originWhitelist: allowedOrigins,
};

const isOriginAllowed = (origin, options) => {
  if (options.originWhitelist.includes("*")) {
    return true;
  }
  if (
    options.originWhitelist.length &&
    !options.originWhitelist.includes(origin)
  ) {
    return false;
  }
  if (
    options.originBlacklist.length &&
    options.originBlacklist.includes(origin)
  ) {
    return false;
  }
  return true;
};

async function handleM3U8Proxy(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  let headers = {};
  try {
    headers = JSON.parse(searchParams.get("headers") || "{}");
  } catch (e) {
    // ignore
  }
  const origin = request.headers.get("Origin") || "";

  if (!isOriginAllowed(origin, options)) {
    return new Response(`The origin "${origin}" is not allowed.`, {
      status: 403,
    });
  }
  if (!targetUrl) {
    return new Response("URL is required", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, { headers });
    if (!response.ok) {
      return new Response("Failed to fetch the m3u8 file", {
        status: response.status,
      });
    }

    let m3u8 = await response.text();
    m3u8 = m3u8
      .split("\n")
      .filter((line) => !line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"))
      .join("\n");

    const lines = m3u8.split("\n");
    const newLines = [];

    lines.forEach((line) => {
      if (!line.trim()) {
        newLines.push(line);
        return;
      }
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-KEY:")) {
          const regex = /URI=(?:"([^"]+)"|([^",]+))/;
          const match = regex.exec(line);
          const keyUrl = match ? match[1] || match[2] : "";
          if (keyUrl) {
            const keyUri = new URL(keyUrl, targetUrl);
            const newUrl = `/ts-proxy?url=${encodeURIComponent(
              keyUri.href
            )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
            newLines.push(line.replace(keyUrl, newUrl));
          } else {
            newLines.push(line);
          }
        } else {
          newLines.push(line);
        }
      } else {
        try {
          const uri = new URL(line.trim(), targetUrl);
          newLines.push(
            `/ts-proxy?url=${encodeURIComponent(
              uri.href
            )}&headers=${encodeURIComponent(JSON.stringify(headers))}`
          );
        } catch (e) {
          newLines.push(line);
        }
      }
    });

    return new Response(newLines.join("\n"), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
    });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}

async function handleTsProxy(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  let headers = {};
  try {
    headers = JSON.parse(searchParams.get("headers") || "{}");
  } catch (e) {
    // ignore
  }
  const origin = request.headers.get("Origin") || "";

  if (!isOriginAllowed(origin, options)) {
    return new Response(`The origin "${origin}" is not allowed.`, {
      status: 403,
    });
  }
  if (!targetUrl) {
    return new Response("URL is required", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36",
        ...headers,
      },
    });

    if (!response.ok) {
      return new Response("Failed to fetch segment", {
        status: response.status,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      },
    });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
