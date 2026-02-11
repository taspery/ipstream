# Pool Scanner (Upcoming Feature)

## Overview

A tool to discover how many unique IPs a proxy provider has for a given location + ASN combination. Helps determine pool size before committing to endpoint generation.

## How It Works

### API Route (`/api/scan-pool`)

- Takes: credentials, city (optional), ASN (optional), sample size (50–200)
- Server-side fires N concurrent requests through the proxy, each with a unique random `sessionid`
- Each request hits `ip-api.com` to resolve the exit IP
- Returns the unique IP set + hit counts per IP

### UI (New tab or section in Generator)

- Same city/ASN selectors as the Generator
- "Scan Pool" button with sample size slider (50–200)
- Progress bar during scan
- Results display:
  - Total unique IPs found
  - Frequency table (IP → hit count)
  - Bar chart showing distribution

### Example Output

```
Sydney + Telstra (1221): 7 unique IPs from 100 samples

  1.145.98.66   ████████████████  32%
  1.144.24.98   ██████████        20%
  1.145.101.206 ████████          16%
  1.123.165.63  ████████          16%
  1.123.130.127 ████              8%
  110.150.3.108 ███               6%
  1.144.19.164  █                 2%
```

## Key Benefits

- **Fast**: Server-side concurrency (10–20 parallel requests)
- **Non-destructive**: Uses random session IDs so existing sticky sessions aren't affected
- **Actionable**: Know the pool size before generating endpoints
- **Per-combo insight**: Test different city + ASN combos to find the best diversity

## Known Pool Sizes (from initial testing)

| Target | Unique IPs (from 50 samples) |
|--------|------------------------------|
| Sydney (no ASN) | ~24 |
| Sydney + Telstra (1221) | ~7 |
| Melbourne (no ASN) | TBD |
| Brisbane (no ASN) | TBD |
| Perth (no ASN) | TBD |
| AU country-only (no city) | TBD |
