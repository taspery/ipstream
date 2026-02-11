"use client";

import { useState, useCallback } from "react";

type Provider = "goproxies" | "oxylabs";

const PROVIDERS: { id: Provider; label: string; host: string; port: number }[] = [
  { id: "goproxies", label: "GoProxies", host: "proxy.goproxies.com", port: 1080 },
  { id: "oxylabs", label: "Oxylabs", host: "pr.oxylabs.io", port: 7777 },
];

/* ── Verified working Australian cities ── */
const AU_REGIONS: { label: string; cities: { name: string; slug: string; note?: string }[] }[] = [
  {
    label: "NSW",
    cities: [
      { name: "Sydney", slug: "sydney" },
      { name: "Parramatta", slug: "parramatta" },
      { name: "Newcastle", slug: "newcastle" },
    ],
  },
  {
    label: "VIC",
    cities: [
      { name: "Melbourne", slug: "melbourne" },
      { name: "Geelong", slug: "geelong" },
      { name: "Doncaster", slug: "doncaster" },
    ],
  },
  {
    label: "QLD",
    cities: [
      { name: "Brisbane", slug: "brisbane" },
      { name: "Gold Coast", slug: "gold_coast" },
      { name: "Cairns", slug: "cairns" },
      { name: "Maroochydore", slug: "maroochydore" },
    ],
  },
  {
    label: "WA",
    cities: [
      { name: "Perth", slug: "perth" },
    ],
  },
  {
    label: "Other",
    cities: [
      { name: "Adelaide", slug: "adelaide", note: "may route to Sydney" },
      { name: "Hobart", slug: "hobart", note: "may route to Launceston" },
      { name: "Canberra", slug: "canberra", note: "may route to Sydney" },
      { name: "Darwin", slug: "darwin", note: "may route to Sydney" },
    ],
  },
];

const AU_ASNS: { asn: string; name: string }[] = [
  { asn: "1221", name: "Telstra" },
  { asn: "4764", name: "Aussie Broadband" },
  { asn: "4804", name: "Microplex / Optus" },
  { asn: "7545", name: "TPG Telecom" },
  { asn: "7474", name: "SingTel Optus" },
  { asn: "9443", name: "Vocus / Dodo" },
  { asn: "4739", name: "Internode" },
  { asn: "9942", name: "iiNet" },
  { asn: "38195", name: "Superloop" },
  { asn: "133612", name: "Aussie Broadband" },
  { asn: "18106", name: "Vodafone AU" },
  { asn: "9924", name: "Primus / Vocus" },
  { asn: "132524", name: "Launtel" },
  { asn: "58511", name: "ABB / Anycast" },
  { asn: "4826", name: "Vocus Group" },
];

interface ProxyGeneratorProps {
  onGenerate: (proxies: string[]) => void;
}

export default function ProxyGenerator({ onGenerate }: ProxyGeneratorProps) {
  const [provider, setProvider] = useState<Provider>("goproxies");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [selectedAsns, setSelectedAsns] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(10);
  const [useCity, setUseCity] = useState(true);
  const [useAsn, setUseAsn] = useState(false);
  const [sessTime, setSessTime] = useState(10);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;

  const toggleRegion = (label: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleCity = (slug: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const selectAllInRegion = (region: typeof AU_REGIONS[number]) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      const allSelected = region.cities.every((c) => next.has(c.slug));
      region.cities.forEach((c) => {
        if (allSelected) next.delete(c.slug);
        else next.add(c.slug);
      });
      return next;
    });
  };

  const toggleAsn = (asn: string) => {
    setSelectedAsns((prev) => {
      const next = new Set(prev);
      if (next.has(asn)) next.delete(asn);
      else next.add(asn);
      return next;
    });
  };

  const selectAllAsns = () => {
    const allSelected = AU_ASNS.every((a) => selectedAsns.has(a.asn));
    if (allSelected) {
      setSelectedAsns(new Set());
    } else {
      setSelectedAsns(new Set(AU_ASNS.map((a) => a.asn)));
    }
  };

  const selectAll = () => {
    const all = AU_REGIONS.flatMap((r) => r.cities.map((c) => c.slug));
    const allSelected = all.every((s) => selectedCities.has(s));
    if (allSelected) {
      setSelectedCities(new Set());
    } else {
      setSelectedCities(new Set(all));
    }
  };

  const generate = useCallback(() => {
    if (!user || !pass) return;

    const cities = useCity ? Array.from(selectedCities) : [null];
    const asns = useAsn && selectedAsns.size > 0 ? Array.from(selectedAsns) : [null];
    const proxies: string[] = [];

    for (let i = 1; i <= count; i++) {
      for (const city of cities) {
        for (const asn of asns) {
          if (provider === "goproxies") {
            const userParts = [`customer-${user}`, "country-au"];
            if (city) userParts.push(`city-au_${city}`);
            if (asn) userParts.push(`asn-${asn}`);
            userParts.push(`sessionid-${i}`);
            proxies.push(
              `http://${userParts.join("-")}:${pass}@proxy.goproxies.com:1080`
            );
          } else if (provider === "oxylabs") {
            // Oxylabs: ASN and country/city can't coexist — ASN takes priority
            const userParts = [`customer-${user}`];
            if (asn) {
              userParts.push(`ASN-${asn}`);
            } else {
              userParts.push("cc-au");
              if (city) userParts.push(`city-${city}`);
            }
            const sessId = `${city || "au"}${asn || ""}${String(i).padStart(3, "0")}`;
            userParts.push(`sessid-${sessId}`, `sesstime-${sessTime * 60}`);
            proxies.push(
              `http://${userParts.join("-")}:${pass}@pr.oxylabs.io:7777`
            );
          }
        }
      }
    }

    onGenerate(proxies);
  }, [user, pass, selectedCities, selectedAsns, count, useCity, useAsn, provider, sessTime, onGenerate]);

  const cityMultiplier = useCity ? Math.max(selectedCities.size, 0) : 1;
  const asnMultiplier = useAsn && selectedAsns.size > 0 ? selectedAsns.size : 1;
  const totalEndpoints = count * cityMultiplier * asnMultiplier;

  const allCitySlugs = AU_REGIONS.flatMap((r) => r.cities.map((c) => c.slug));
  const allSelected = allCitySlugs.length > 0 && allCitySlugs.every((s) => selectedCities.has(s));

  // Oxylabs note: ASN can't combine with country/city
  const oxyAsnWarning = provider === "oxylabs" && useAsn && useCity;

  return (
    <div className="gen-container">
      {/* Provider selector */}
      <div className="gen-section">
        <label className="gen-label">Provider</label>
        <div className="gen-provider-row">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`gen-provider-btn ${provider === p.id ? "active" : ""}`}
              onClick={() => setProvider(p.id)}
            >
              {p.label}
              <span className="gen-provider-host">{p.host}:{p.port}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Credentials */}
      <div className="gen-section">
        <label className="gen-label">{providerInfo.label} Credentials</label>
        <div className="gen-creds-row">
          <div className="gen-field">
            <span className="gen-field-prefix">customer-</span>
            <input
              type="text"
              className="gen-input"
              value={user}
              onChange={(e) => setUser(e.target.value.trim())}
              placeholder="username"
            />
          </div>
          <div className="gen-field">
            <span className="gen-field-prefix">pass</span>
            <input
              type={showPass ? "text" : "password"}
              className="gen-input"
              value={pass}
              onChange={(e) => setPass(e.target.value.trim())}
              placeholder="password"
            />
            <button
              type="button"
              className="gen-eye-btn"
              onClick={() => setShowPass((v) => !v)}
              title={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sessions per city */}
      <div className="gen-section">
        <label className="gen-label">
          Sessions per {useCity ? "city" : "country"}
        </label>
        <div className="gen-count-row">
          <input
            type="range"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="gen-slider"
          />
          <span className="gen-count-value">{count}</span>
        </div>
      </div>

      {/* City targeting toggle */}
      <div className="gen-section">
        <div className="gen-toggle-row">
          <label className="gen-label" style={{ marginBottom: 0 }}>
            City Targeting
          </label>
          <button
            className={`gen-toggle ${useCity ? "on" : ""}`}
            onClick={() => setUseCity((v) => !v)}
          >
            <span className="gen-toggle-knob" />
          </button>
        </div>
      </div>

      {/* Session time (Oxylabs only) */}
      {provider === "oxylabs" && (
        <div className="gen-section">
          <label className="gen-label">
            Session Duration <span className="optional-tag">{sessTime}m</span>
          </label>
          <div className="gen-count-row">
            <input
              type="range"
              min={1}
              max={1440}
              step={1}
              value={sessTime}
              onChange={(e) => setSessTime(Number(e.target.value))}
              className="gen-slider"
            />
            <span className="gen-count-value">{sessTime}m</span>
          </div>
        </div>
      )}

      {/* ASN targeting toggle */}
      <div className="gen-section">
        <div className="gen-toggle-row">
          <label className="gen-label" style={{ marginBottom: 0 }}>
            ASN Targeting
          </label>
          <button
            className={`gen-toggle ${useAsn ? "on" : ""}`}
            onClick={() => setUseAsn((v) => !v)}
          >
            <span className="gen-toggle-knob" />
          </button>
        </div>
        {oxyAsnWarning && (
          <span className="gen-warning">
            Oxylabs: ASN and Country/City can&apos;t be combined. ASN will take priority, city targeting will be ignored.
          </span>
        )}
      </div>

      {/* ASN selector */}
      {useAsn && (
        <div className="gen-section">
          <div className="gen-city-header">
            <label className="gen-label" style={{ marginBottom: 0 }}>
              ASNs ({selectedAsns.size} selected)
            </label>
            <button className="gen-select-all" onClick={selectAllAsns}>
              {AU_ASNS.every((a) => selectedAsns.has(a.asn))
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
          <div className="gen-city-grid" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.6rem 0.75rem", background: "var(--bg)" }}>
            {AU_ASNS.map((a) => (
              <button
                key={a.asn}
                className={`gen-city-chip ${
                  selectedAsns.has(a.asn) ? "selected" : ""
                }`}
                onClick={() => toggleAsn(a.asn)}
              >
                <span style={{ color: selectedAsns.has(a.asn) ? "inherit" : "var(--accent)", fontWeight: 600 }}>
                  {a.asn}
                </span>{" "}
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* City selector */}
      {useCity && (
        <div className="gen-section">
          <div className="gen-city-header">
            <label className="gen-label" style={{ marginBottom: 0 }}>
              Cities ({selectedCities.size} selected)
            </label>
            <button className="gen-select-all" onClick={selectAll}>
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
          <div className="gen-regions">
            {AU_REGIONS.map((region) => {
              const regionSelected = region.cities.filter((c) =>
                selectedCities.has(c.slug)
              ).length;
              const isExpanded = expandedRegions.has(region.label);

              return (
                <div key={region.label} className="gen-region">
                  <div className="gen-region-header">
                    <button
                      className="gen-region-toggle"
                      onClick={() => toggleRegion(region.label)}
                    >
                      <span className={`gen-chevron ${isExpanded ? "open" : ""}`}>
                        ›
                      </span>
                      <span className="gen-region-name">{region.label}</span>
                      <span className="gen-region-count">
                        {regionSelected}/{region.cities.length}
                      </span>
                    </button>
                    <button
                      className="gen-region-all"
                      onClick={() => selectAllInRegion(region)}
                    >
                      {regionSelected === region.cities.length ? "–" : "+"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="gen-city-grid">
                      {region.cities.map((city) => (
                        <button
                          key={city.slug}
                          className={`gen-city-chip ${
                            selectedCities.has(city.slug) ? "selected" : ""
                          }`}
                          onClick={() => toggleCity(city.slug)}
                          title={city.note || ""}
                        >
                          {city.name}
                          {city.note && <span className="gen-city-warn">*</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate button */}
      <div className="gen-actions">
        <button
          className="btn active gen-btn"
          onClick={generate}
          disabled={!user || !pass || (useCity && selectedCities.size === 0) || (useAsn && selectedAsns.size === 0)}
        >
          Generate {totalEndpoints} Endpoint{totalEndpoints !== 1 ? "s" : ""}
        </button>
        <span className="gen-hint">
          Outputs to Proxy Tester textarea
        </span>
      </div>
    </div>
  );
}
