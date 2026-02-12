"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ProxyTester from "./ProxyTester";
import ProxyGenerator from "./ProxyGenerator";

const INTERVAL = 2000;

type Tab = "stream" | "proxy" | "generator";

interface IpData {
  ip: string;
  asn: string;
  isp: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
}

interface HistoryEntry {
  id: number;
  ip: string;
  asn: string;
  location: string;
  time: string;
  changed: boolean;
  isNew: boolean;
}

function countryFlag(code: string): string {
  if (!code) return "";
  const cp = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 - 65 + c.charCodeAt(0)
  );
  return String.fromCodePoint(...cp);
}

export default function IpStreamMonitor() {
  const [activeTab, setActiveTab] = useState<Tab>("stream");
  const [generatedProxies, setGeneratedProxies] = useState("");
  const [currentData, setCurrentData] = useState<IpData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [running, setRunning] = useState(true);
  const [statusText, setStatusText] = useState("Starting...");
  const [progress, setProgress] = useState(0);

  const lastIpRef = useRef<string | null>(null);
  const ipChangesRef = useRef(0);
  const lastAsnRef = useRef<string | null>(null);
  const asnChangesRef = useRef(0);
  const uniqueSetRef = useRef(new Set<string>());
  const entryIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(true);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const fetchIPData = useCallback(async (): Promise<IpData | null> => {
    try {
      const res = await fetch("/api/ip");
      if (!res.ok) throw new Error("API error");
      return await res.json();
    } catch (e) {
      console.error("Fetch failed:", e);
      return null;
    }
  }, []);

  const startProgress = useCallback(() => {
    setProgress(0);
    let elapsed = 0;
    const step = 50;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      elapsed += step;
      const pct = Math.min((elapsed / INTERVAL) * 100, 100);
      setProgress(pct);
    }, step);
  }, []);

  const stopProgress = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgress(0);
  }, []);

  const doFetch = useCallback(async () => {
    setStatusText("Fetching...");
    const data = await fetchIPData();

    if (data) {
      const changed =
        lastIpRef.current !== null && lastIpRef.current !== data.ip;
      if (changed) ipChangesRef.current++;
      lastIpRef.current = data.ip;

      const asnChanged =
        lastAsnRef.current !== null && lastAsnRef.current !== data.asn;
      if (asnChanged) asnChangesRef.current++;
      lastAsnRef.current = data.asn;
      uniqueSetRef.current.add(data.ip);

      setCurrentData(data);

      const flag = countryFlag(data.countryCode);
      const location = [data.city, data.region, data.country]
        .filter(Boolean)
        .join(", ");
      const now = new Date();
      const timeStr =
        now.toLocaleTimeString("en-US", { hour12: false }) +
        "." +
        String(now.getMilliseconds()).padStart(3, "0");

      entryIdRef.current++;
      const entry: HistoryEntry = {
        id: entryIdRef.current,
        ip: data.ip,
        asn: data.asn,
        location: `${flag} ${location}`,
        time: timeStr,
        changed,
        isNew: true,
      };

      setHistory((prev) => [entry, ...prev]);

      setTimeout(() => {
        setHistory((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, isNew: false } : e))
        );
      }, 600);
    }

    setStatusText(
      runningRef.current
        ? `Streaming — next check in ${INTERVAL / 1000}s`
        : "Paused"
    );
  }, [fetchIPData]);

  const startStream = useCallback(() => {
    setRunning(true);
    runningRef.current = true;
    setStatusText(`Streaming — every ${INTERVAL / 1000}s`);

    doFetch();
    startProgress();

    timerRef.current = setInterval(() => {
      stopProgress();
      doFetch();
      startProgress();
    }, INTERVAL);
  }, [doFetch, startProgress, stopProgress]);

  const stopStream = useCallback(() => {
    setRunning(false);
    runningRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopProgress();
    setStatusText("Paused");
  }, [stopProgress]);

  const toggleStream = useCallback(() => {
    if (runningRef.current) {
      stopStream();
    } else {
      startStream();
    }
  }, [startStream, stopStream]);

  const fetchNow = useCallback(async () => {
    stopProgress();
    await doFetch();
    if (runningRef.current) startProgress();
  }, [doFetch, startProgress, stopProgress]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    lastIpRef.current = null;
    ipChangesRef.current = 0;
    lastAsnRef.current = null;
    asnChangesRef.current = 0;
    uniqueSetRef.current.clear();
    setCurrentData(null);
  }, []);

  // Handle tab switching — pause stream when on proxy/generator tab
  const switchTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      if ((tab === "proxy" || tab === "generator") && runningRef.current) {
        stopStream();
      }
      if (tab === "stream" && !runningRef.current) {
        startStream();
      }
    },
    [startStream, stopStream]
  );

  // When proxies are generated, populate the tester and switch to proxy tab
  const handleGenerate = useCallback(
    (proxies: string[]) => {
      setGeneratedProxies(proxies.join("\n"));
      setActiveTab("proxy");
    },
    []
  );

  // Start on mount
  useEffect(() => {
    startStream();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalChecks = history.length;
  const uniqueIps = uniqueSetRef.current.size;
  const ipChanges = ipChangesRef.current;
  const asnChanges = asnChangesRef.current;

  const flag = currentData ? countryFlag(currentData.countryCode) : "";
  const location = currentData
    ? [currentData.city, currentData.region, currentData.country]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <>
      <div className="scanline" />
      <div className="container">
        <header>
          <div className="logo-row">
            <div className="pulse-dot" />
            <h1>IP STREAM</h1>
          </div>
          <div className="subtitle">
            Real-time IP / ASN / geolocation tracker + proxy tester
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab${activeTab === "stream" ? " active" : ""}`}
            onClick={() => switchTab("stream")}
          >
            ▸ IP Stream
          </button>
          <button
            className={`tab${activeTab === "proxy" ? " active" : ""}`}
            onClick={() => switchTab("proxy")}
          >
            ▸ Proxy Tester
          </button>
          <button
            className={`tab${activeTab === "generator" ? " active" : ""}`}
            onClick={() => switchTab("generator")}
          >
            ▸ Generator
          </button>
        </div>

        {/* IP Stream Tab */}
        <div style={{ display: activeTab === "stream" ? "block" : "none" }}>
            <div className="current-card">
              <div className="current-label">&#9658; Current Connection</div>
              <div className="current-ip">{currentData?.ip ?? "—"}</div>
              <div className="current-details">
                <div className="detail-item">
                  <span className="detail-label">ASN / ISP</span>
                  <span className="detail-value">
                    {currentData?.asn ?? "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Location</span>
                  <span className="detail-value">
                    {currentData ? `${flag} ${location}` : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Coordinates</span>
                  <span className="detail-value">
                    {currentData
                      ? `${currentData.lat}, ${currentData.lon}`
                      : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Timezone</span>
                  <span className="detail-value">
                    {currentData?.timezone ?? "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-number">{totalChecks}</div>
                <div className="stat-label">Total Checks</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">{uniqueIps}</div>
                <div className="stat-label">Unique IPs</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">{ipChanges}</div>
                <div className="stat-label">IP Changes</div>
              </div>
              <div className="stat-box">
                <div className="stat-number">{asnChanges}</div>
                <div className="stat-label">ASN Changes</div>
              </div>
            </div>

            <div className="status-text">
              <div className={`status-dot${!running ? " paused" : ""}`} />
              <span>{statusText}</span>
            </div>
            <div className="loading-bar">
              <div
                className="loading-bar-inner"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="controls">
              <button
                className={running ? "active" : ""}
                onClick={toggleStream}
              >
                {running ? "⏸ Pause" : "▶ Resume"}
              </button>
              <button onClick={fetchNow}>↻ Fetch Now</button>
              <div className="spacer" />
              <button className="danger" onClick={clearHistory}>
                ✕ Clear
              </button>
            </div>

            <div className="history-section">
              <div className="history-header">
                <span>#</span>
                <span>IP Address</span>
                <span>ASN / ISP</span>
                <span>Location</span>
                <span>Time</span>
              </div>
              <div className="history-list">
                {history.length === 0 ? (
                  <div className="empty-state">
                    Waiting for first check...
                  </div>
                ) : (
                  history.map((entry, i) => (
                    <div
                      key={entry.id}
                      className={`history-row${entry.isNew ? " new-entry" : ""}`}
                    >
                      <span className="row-index">{history.length - i}</span>
                      <span
                        className={`row-ip${entry.changed ? " ip-changed" : ""}`}
                      >
                        {entry.ip}
                      </span>
                      <span className="row-asn">{entry.asn}</span>
                      <span className="row-location">{entry.location}</span>
                      <span className="row-time">{entry.time}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
        </div>

        {/* Proxy Tester Tab */}
        <div style={{ display: activeTab === "proxy" ? "block" : "none" }}>
          <ProxyTester externalInput={generatedProxies} />
        </div>

        {/* Generator Tab */}
        <div style={{ display: activeTab === "generator" ? "block" : "none" }}>
          <ProxyGenerator onGenerate={handleGenerate} />
        </div>
      </div>
    </>
  );
}
