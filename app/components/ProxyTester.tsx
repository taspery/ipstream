"use client";

import { useCallback, useRef, useState } from "react";

interface ProxyResult {
  proxy: string;
  ip?: string;
  asn?: string;
  isp?: string;
  location?: string;
  city?: string;
  region?: string;
  country?: string;
  cc?: string;
  status: "ok" | "fail" | "testing";
  error?: string;
}

interface ParsedProxy {
  protocol: string;
  host: string;
  port: string;
  username: string;
  password: string;
}

function parseProxyUrl(raw: string): ParsedProxy {
  const result: ParsedProxy = {
    protocol: "",
    host: "",
    port: "",
    username: "",
    password: "",
  };

  try {
    // Already a URL with scheme
    if (/^(https?|socks[45]?):\/\//i.test(raw)) {
      const url = new URL(raw);
      result.protocol = url.protocol.replace(":", "");
      result.host = url.hostname;
      result.port = url.port;
      result.username = decodeURIComponent(url.username);
      result.password = decodeURIComponent(url.password);
      return result;
    }

    // host:port:user:pass
    const parts = raw.split(":");
    if (parts.length === 4) {
      result.protocol = "http";
      result.host = parts[0];
      result.port = parts[1];
      result.username = parts[2];
      result.password = parts[3];
      return result;
    }

    // host:port
    if (parts.length === 2) {
      result.protocol = "http";
      result.host = parts[0];
      result.port = parts[1];
      return result;
    }

    // user:pass@host:port (no scheme)
    if (raw.includes("@")) {
      const url = new URL(`http://${raw}`);
      result.protocol = "http";
      result.host = url.hostname;
      result.port = url.port;
      result.username = decodeURIComponent(url.username);
      result.password = decodeURIComponent(url.password);
      return result;
    }
  } catch {
    // fallback
  }

  result.host = raw;
  return result;
}

function countryFlag(code: string): string {
  if (!code) return "";
  const cp = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 - 65 + c.charCodeAt(0)
  );
  return String.fromCodePoint(...cp);
}

function fmtLocation(
  city?: string | null,
  region?: string | null,
  country?: string | null,
  cc?: string | null
): string {
  const flag = cc ? countryFlag(cc) : "";
  const parts = [city, region, country].filter(Boolean).join(", ");
  return flag ? `${flag} ${parts}` : parts || "—";
}

/**
 * Inject `-asn{value}` into the proxy username, right before `-country`.
 * e.g. customer-123123-country-au  →  customer-123123-asn-1221-country-au
 */
function injectAsn(proxyUrl: string, asn: string): string {
  if (!asn) return proxyUrl;
  return proxyUrl.replace(/(-country)/i, `-asn-${asn}$1`);
}

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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="modal-field">
      <span className="modal-field-label">{label}</span>
      <div className="modal-field-row">
        <span className="modal-field-value">{value || "—"}</span>
        {value && (
          <button className="modal-copy-btn" onClick={copy}>
            {copied ? "✓" : "⧉"}
          </button>
        )}
      </div>
    </div>
  );
}

function ProxyDetailModal({
  proxy,
  onClose,
}: {
  proxy: string;
  onClose: () => void;
}) {
  const parsed = parseProxyUrl(proxy);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Proxy Details</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <CopyField label="Protocol" value={parsed.protocol} />
          <CopyField label="Host" value={parsed.host} />
          <CopyField label="Port" value={parsed.port} />
          <CopyField label="Username" value={parsed.username} />
          <CopyField label="Password" value={parsed.password} />
          <CopyField label="Full URL" value={proxy} />
        </div>
      </div>
    </div>
  );
}

export default function ProxyTester() {
  const [proxyInput, setProxyInput] = useState("");
  const [asnInput, setAsnInput] = useState("");
  const [results, setResults] = useState<ProxyResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [asnDropdownOpen, setAsnDropdownOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "ok" | "fail" | "unique">("all");
  const abortRef = useRef(false);
  const doneCountRef = useRef(0);

  const parseProxies = useCallback((): string[] => {
    const raw = proxyInput.trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }, [proxyInput]);

  const proxyCount = parseProxies().length;

  const testSingleProxy = async (
    proxyUrl: string
  ): Promise<{ success: boolean; [key: string]: unknown }> => {
    try {
      const res = await fetch("/api/test-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy: proxyUrl }),
      });
      if (!res.ok) throw new Error("Backend error " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return { success: true, ...data };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  };

  const CONCURRENCY = 10;

  const testProxyAtIndex = async (finalProxies: string[], i: number) => {
    const result = await testSingleProxy(finalProxies[i]);

    setResults((prev) => {
      const updated = [...prev];
      if (result.success) {
        const loc = fmtLocation(
          result.city as string,
          result.region as string,
          result.country as string,
          result.countryCode as string
        );
        updated[i] = {
          proxy: finalProxies[i],
          ip: result.ip as string,
          asn: (result.asn as string) || "—",
          isp: (result.isp as string) || "—",
          location: loc,
          city: result.city as string,
          region: result.region as string,
          country: result.country as string,
          cc: result.countryCode as string,
          status: "ok",
        };
      } else {
        updated[i] = {
          proxy: finalProxies[i],
          status: "fail",
          error: result.error as string,
        };
      }
      return updated;
    });
  };

  const testAllProxies = async () => {
    const proxies = parseProxies();
    if (proxies.length === 0) return;

    const asn = asnInput.trim();

    abortRef.current = false;
    doneCountRef.current = 0;
    setTesting(true);
    setResults([]);

    // Apply ASN injection if provided
    const finalProxies = proxies.map((p) => (asn ? injectAsn(p, asn) : p));

    // Initialize all as testing
    const initial: ProxyResult[] = finalProxies.map((p) => ({
      proxy: p,
      status: "testing",
    }));
    setResults(initial);

    // Concurrent pool
    let nextIndex = 0;
    const total = finalProxies.length;

    const worker = async () => {
      while (!abortRef.current) {
        const i = nextIndex++;
        if (i >= total) break;
        await testProxyAtIndex(finalProxies, i);
        doneCountRef.current++;
        setProgressText(`Testing... ${doneCountRef.current}/${total} done`);
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, total) },
      () => worker()
    );
    await Promise.all(workers);

    setTesting(false);
    setProgressText("");
  };

  const stopTesting = () => {
    abortRef.current = true;
  };

  const clearResults = () => {
    setResults([]);
    setTesting(false);
    setFilter("all");
    abortRef.current = true;
  };

  const copyProxy = (index: number) => {
    const r = results[index];
    if (!r || r.status !== "ok") return;
    const text = `${r.proxy} → ${r.ip} | ${r.asn} | ${r.location}`;
    navigator.clipboard.writeText(text);
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    const header = "Proxy,IP,ASN,ISP,City,Region,Country,Status\n";
    const rows = results
      .map(
        (r) =>
          `"${r.proxy}","${r.ip || ""}","${r.asn || ""}","${r.isp || ""}","${r.city || ""}","${r.region || ""}","${r.country || ""}","${r.status}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proxy-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasResults = results.length > 0;
  const okCount = results.filter((r) => r.status === "ok").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const uniqueIpSet = new Set(
    results.filter((r) => r.status === "ok" && r.ip).map((r) => r.ip)
  );
  const uniqueIpCount = uniqueIpSet.size;

  // Build filtered + indexed list so we keep original indices for actions
  const filteredResults: { result: ProxyResult; originalIndex: number }[] = (() => {
    if (filter === "ok") {
      return results
        .map((r, i) => ({ result: r, originalIndex: i }))
        .filter(({ result }) => result.status === "ok");
    }
    if (filter === "fail") {
      return results
        .map((r, i) => ({ result: r, originalIndex: i }))
        .filter(({ result }) => result.status === "fail");
    }
    if (filter === "unique") {
      const seen = new Set<string>();
      return results
        .map((r, i) => ({ result: r, originalIndex: i }))
        .filter(({ result }) => {
          if (result.status !== "ok" || !result.ip) return false;
          if (seen.has(result.ip)) return false;
          seen.add(result.ip);
          return true;
        });
    }
    return results.map((r, i) => ({ result: r, originalIndex: i }));
  })();

  const toggleFilter = (f: "all" | "ok" | "fail" | "unique") => {
    setFilter((prev) => (prev === f ? "all" : f));
  };

  return (
    <>
      <div className="note-bar">
        Supported formats: <code>http://user:pass@host:port</code>{" "}
        <code>socks5://user:pass@host:port</code>{" "}
        <code>host:port:user:pass</code> <code>host:port</code>
      </div>

      {/* Input section */}
      <div className="proxy-input-section">
        <label>Proxy List</label>
        <textarea
          className="proxy-textarea"
          value={proxyInput}
          onChange={(e) => setProxyInput(e.target.value)}
          placeholder={`http://user:pass@proxy1.example.com:8080\nsocks5://user:pass@proxy2.example.com:1080\n123.45.67.89:8080:myuser:mypass\nhttp://proxy3.example.com:3128`}
        />

        <div className="asn-input-row">
          <label>ASN Override <span className="optional-tag">optional</span></label>
          <div className="asn-input-wrapper">
            <span className="asn-prefix">ASN</span>
            <input
              type="text"
              className="asn-input"
              value={asnInput}
              onChange={(e) => setAsnInput(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 1221"
              disabled={testing}
            />
          </div>
          <div className="asn-dropdown-wrap">
            <button
              className="btn asn-dropdown-btn"
              onClick={() => setAsnDropdownOpen((v) => !v)}
              disabled={testing}
              type="button"
            >
              AU ASNs ▾
            </button>
            {asnDropdownOpen && (
              <div className="asn-dropdown">
                {AU_ASNS.map((a) => (
                  <button
                    key={a.asn}
                    className="asn-dropdown-item"
                    onClick={() => {
                      setAsnInput(a.asn);
                      setAsnDropdownOpen(false);
                    }}
                  >
                    <span className="asn-dropdown-num">{a.asn}</span>
                    <span className="asn-dropdown-name">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {asnInput && (
            <span className="asn-preview">
              Inserts <code>-asn-{asnInput}</code> before <code>-country</code>
            </span>
          )}
        </div>

        <div className="proxy-controls">
          {!testing ? (
            <button className="btn active" onClick={testAllProxies}>
              ▶ Test All
            </button>
          ) : (
            <button className="btn danger" onClick={stopTesting}>
              ■ Stop
            </button>
          )}
          <button className="btn" onClick={exportCSV}>
            ↓ Export CSV
          </button>
          <button className="btn danger" onClick={clearResults}>
            ✕ Clear
          </button>
          <div className="spacer" />
          <span className="proxy-count">
            {proxyCount} prox{proxyCount === 1 ? "y" : "ies"}
          </span>
        </div>
      </div>

      {/* Progress */}
      {testing && (
        <div className="progress-info visible">
          <div className="spinner" />
          <span>{progressText}</span>
        </div>
      )}

      {/* Summary stats — clickable to filter */}
      {hasResults && !testing && (
        <div className="proxy-stats-row">
          <button
            className={`proxy-stat clickable${filter === "all" ? " active-filter" : ""}`}
            onClick={() => toggleFilter("all")}
          >
            <span className="proxy-stat-num">{results.length}</span>
            <span className="proxy-stat-label">Tested</span>
          </button>
          <button
            className={`proxy-stat clickable${filter === "ok" ? " active-filter" : ""}`}
            onClick={() => toggleFilter("ok")}
          >
            <span className="proxy-stat-num ok">{okCount}</span>
            <span className="proxy-stat-label">Working</span>
          </button>
          <button
            className={`proxy-stat clickable${filter === "fail" ? " active-filter" : ""}`}
            onClick={() => toggleFilter("fail")}
          >
            <span className="proxy-stat-num fail">{failCount}</span>
            <span className="proxy-stat-label">Failed</span>
          </button>
          <button
            className={`proxy-stat clickable${filter === "unique" ? " active-filter" : ""}`}
            onClick={() => toggleFilter("unique")}
          >
            <span className="proxy-stat-num unique">{uniqueIpCount}</span>
            <span className="proxy-stat-label">Unique IPs</span>
          </button>
        </div>
      )}

      {/* Results table */}
      {hasResults && (
        <div className="proxy-results">
          <div className="proxy-results-header">
            <span>#</span>
            <span>Proxy</span>
            <span>IP Address</span>
            <span>ASN / ISP</span>
            <span>Location</span>
            <span>Status</span>
            <span></span>
          </div>
          <div className="proxy-results-list">
            {filteredResults.map(({ result: r, originalIndex }) => (
              <div key={originalIndex} className="proxy-row">
                <span className="row-index">{originalIndex + 1}</span>
                <span className="proxy-label" title={r.proxy}>
                  {r.proxy}
                </span>
                {r.status === "testing" ? (
                  <>
                    <span className="row-ip">...</span>
                    <span className="row-asn">...</span>
                    <span className="row-location">...</span>
                    <span>
                      <span className="status-badge testing">testing</span>
                    </span>
                    <span></span>
                  </>
                ) : r.status === "ok" ? (
                  <>
                    <span className="row-ip">{r.ip}</span>
                    <span className="row-asn">{r.asn}</span>
                    <span className="row-location">{r.location}</span>
                    <span>
                      <span className="status-badge success">ok</span>
                    </span>
                    <span className="row-actions">
                      <button
                        className="copy-btn"
                        onClick={() => copyProxy(originalIndex)}
                      >
                        copy
                      </button>
                      <button
                        className="copy-btn"
                        onClick={() => setDetailIndex(originalIndex)}
                      >
                        info
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="row-ip" style={{ color: "var(--red)" }}>
                      failed
                    </span>
                    <span
                      className="row-asn"
                      style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}
                      title={r.error}
                    >
                      {r.error?.substring(0, 30)}
                    </span>
                    <span>—</span>
                    <span>
                      <span className="status-badge fail">fail</span>
                    </span>
                    <span></span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proxy detail modal */}
      {detailIndex !== null && results[detailIndex] && (
        <ProxyDetailModal
          proxy={results[detailIndex].proxy}
          onClose={() => setDetailIndex(null)}
        />
      )}
    </>
  );
}
