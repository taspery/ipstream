import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { HttpProxyAgent } from "http-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeProxy(input: string): string {
  // Already a URL: http://user:pass@host:port or socks5://...
  if (/^(https?|socks[45]?):\/\//i.test(input)) {
    return input;
  }

  const parts = input.split(":");

  // Format: host:port:user:pass
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }

  // Format: host:port (no auth)
  if (parts.length === 2) {
    return `http://${input}`;
  }

  // Format: user:pass@host:port (missing scheme)
  if (input.includes("@")) {
    return `http://${input}`;
  }

  return `http://${input}`;
}

function createAgent(proxyUrl: string) {
  if (/^socks/i.test(proxyUrl)) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpProxyAgent(proxyUrl);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { proxy } = body;

    if (!proxy) {
      return NextResponse.json({ error: "Missing proxy field" }, { status: 400 });
    }

    const proxyUrl = normalizeProxy(proxy.trim());
    const agent = createAgent(proxyUrl);

    const fields = "status,message,query,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as";
    const response = await axios.get(`http://ip-api.com/json/?fields=${fields}`, {
      httpAgent: agent,
      timeout: 15000,
    });

    const d = response.data;

    if (d.status !== "success") {
      return NextResponse.json({
        error: "IP lookup failed: " + (d.message || "unknown"),
      });
    }

    return NextResponse.json({
      ip: d.query,
      asn: d.as || null,
      isp: d.isp || d.org || null,
      city: d.city || null,
      region: d.regionName || null,
      country: d.country || null,
      countryCode: d.countryCode || null,
      lat: d.lat,
      lon: d.lon,
      timezone: d.timezone || null,
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    const msg =
      error.code === "ECONNREFUSED"
        ? "Connection refused"
        : error.code === "ETIMEDOUT"
          ? "Timed out"
          : error.code === "ENOTFOUND"
            ? "Host not found"
            : error.code === "ECONNRESET"
              ? "Connection reset"
              : error.message || "Unknown error";

    return NextResponse.json({ error: msg });
  }
}
