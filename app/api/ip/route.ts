import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  // Get the real visitor IP from headers (Vercel / reverse proxy)
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  try {
    // ip-api.com free tier — HTTP only, no key needed
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=49983`
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
        { error: "Lookup failed" },
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
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch IP data" },
      { status: 500 }
    );
  }
}
