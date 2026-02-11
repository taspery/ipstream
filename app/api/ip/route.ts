import { NextRequest, NextResponse } from "next/server";

// Use Node.js runtime — ip-api.com free tier is HTTP-only (no HTTPS)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLocalIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip === "localhost"
  );
}

export async function GET(request: NextRequest) {
  // Get the real visitor IP from headers (Vercel / reverse proxy)
  const forwarded = request.headers.get("x-forwarded-for");
  const rawIp = forwarded ? forwarded.split(",")[0].trim() : "";

  // If local/missing IP, omit it so ip-api returns the server's own public IP
  const ipSegment = rawIp && !isLocalIp(rawIp) ? `/${rawIp}` : "";

  try {
    const fields = "status,message,query,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as";
    const res = await fetch(
      `http://ip-api.com/json${ipSegment}?fields=${fields}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Upstream API error" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (data.status !== "success") {
      return NextResponse.json(
        { error: "Lookup failed", detail: data.message },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ip: data.query,
      asn: data.as || "—",
      isp: data.isp || data.org || "—",
      city: data.city || "",
      region: data.regionName || "",
      country: data.country || "",
      countryCode: data.countryCode || "",
      lat: data.lat,
      lon: data.lon,
      timezone: data.timezone || "—",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch IP data", detail: String(e) },
      { status: 500 }
    );
  }
}
