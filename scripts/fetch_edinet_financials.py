#!/usr/bin/env python3
"""Refresh packages/shared/src/market-research/edinet-snapshot.json.

EDINET's API is date-indexed (no company-lookup endpoint), so we scan the
annual-report filing windows, resolve each curated company's latest
有価証券報告書 (docTypeCode 120), download its financial CSV (type=5), and
extract the current-year (CurrentYearDuration) consolidated net sales /
revenue from the 主要な経営指標等の推移 summary.

Run periodically to keep the snapshot fresh:
    EDINET_API_KEY=<your key> python scripts/fetch_edinet_financials.py

Get a free key at https://api.edinet-fsa.go.jp/api/auth/index.aspx?mode=1
"""
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile

sys.stdout.reconfigure(encoding="utf-8")
KEY = os.environ.get("EDINET_API_KEY")
if not KEY:
    sys.exit("Set EDINET_API_KEY (https://api.edinet-fsa.go.jp/api/auth/index.aspx?mode=1)")
BASE = "https://api.edinet-fsa.go.jp/api/v2"
OUT = os.path.join(os.path.dirname(__file__), "..", "packages", "shared", "src",
                   "market-research", "edinet-snapshot.json")

# Curated brand keyword-set → EDINET 5-digit securities code. Extend as needed;
# an unresolved / wrong code simply never enters the snapshot (safe).
CUR = {
    "79740": "Nintendo", "22690": "Meiji Holdings", "67580": "Sony Group",
    "49110": "Shiseido", "44520": "Kao", "99830": "Fast Retailing (Uniqlo)",
    "28020": "Ajinomoto", "28970": "Nissin Foods", "28010": "Kikkoman",
    "25020": "Asahi Group", "25030": "Kirin Holdings", "25870": "Suntory Bev & Food",
    "49220": "Kose", "49270": "Pola Orbis", "74530": "Ryohin Keikaku (MUJI)",
    "22670": "Yakult", "22290": "Calbee", "81130": "Unicharm",
}
# Revenue elements in priority order (J-GAAP NetSales, then IFRS variants).
PRIO = [
    "jpcrp_cor:NetSalesSummaryOfBusinessResults",
    "jpcrp_cor:RevenuesIFRSSummaryOfBusinessResults",
    "jpcrp_cor:NetSalesIFRSSummaryOfBusinessResults",
    "jpcrp_cor:SalesRevenueIFRSSummaryOfBusinessResults",
    "jpcrp_cor:RevenueIFRSSummaryOfBusinessResults",
    "jpcrp_cor:OperatingRevenuesIFRSSummaryOfBusinessResults",
]


def _get(url):
    return urllib.request.urlopen(url, timeout=30)


def _days():
    # Annual reports cluster ~3 months after fiscal year end: Nov (Aug FY),
    # Mar (Dec FY), Jun–Jul (Mar FY).
    out = []
    out += [f"2025-11-{d:02d}" for d in range(12, 29)]
    out += [f"2026-03-{d:02d}" for d in range(16, 32)]
    out += [f"2026-06-{d:02d}" for d in range(16, 31)]
    out += [f"2026-07-{d:02d}" for d in range(1, 9)]
    return out


def _revenue(doc_id):
    p = urllib.parse.urlencode({"type": "5", "Subscription-Key": KEY})
    z = zipfile.ZipFile(io.BytesIO(_get(f"{BASE}/documents/{doc_id}?{p}").read()))
    cur = {}
    for n in z.namelist():
        if n.lower().endswith(".csv") and "jpcrp" in n.lower():
            for ln in z.read(n).decode("utf-16").splitlines():
                c = [x.strip('"') for x in ln.split("\t")]
                if (len(c) > 2 and c[2] == "CurrentYearDuration"
                        and c[0].endswith("SummaryOfBusinessResults")
                        and re.search(r"(NetSales|Revenue)", c[0])):
                    try:
                        cur[c[0]] = int(c[-1])
                    except ValueError:
                        pass
    for k in PRIO:
        if k in cur:
            return cur[k]
    return next(iter(cur.values())) if cur else None


def main():
    idx = {}
    for day in _days():
        try:
            p = urllib.parse.urlencode({"date": day, "type": "2", "Subscription-Key": KEY})
            for r in json.load(_get(f"{BASE}/documents.json?{p}")).get("results", []):
                if r.get("docTypeCode") == "120" and r.get("secCode") in CUR:
                    sc, pe = r["secCode"], r.get("periodEnd", "")
                    if sc not in idx or pe > idx[sc][1]:
                        idx[sc] = (r["docID"], pe)
        except Exception:
            pass
    snap = {}
    for sc, (doc_id, pe) in sorted(idx.items()):
        v = _revenue(doc_id)
        if v:
            snap[sc] = {"name": CUR[sc], "fiscalYear": pe[:4], "netSalesJpy": v}
            print(f"  {sc} {CUR[sc]:26s} FY{pe[:4]} ¥{v/1e12:5.2f}T")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)
    print(f"\nwrote edinet-snapshot.json: {len(snap)}/{len(CUR)} companies")


if __name__ == "__main__":
    main()
