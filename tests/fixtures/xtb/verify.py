"""Verify our synthetic workbook only; this is NOT an importer for user files.

Python standard library, no dependencies or database access. Run from any cwd:
    python3 tests/fixtures/xtb/verify.py
"""
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = {
    "Closed Positions": "Instrument|Ticker|Category|Type|Volume|Open Price|Open Time (UTC)|Close Price|Close Time (UTC)|Product|Profit/Loss|Gross Profit|Purchase Value|Sale Value|Stop Loss|Take Profit|Commission|Margin|Swap|Rollover|Open Conversion Rate|Close Conversion Rate|Close Origin|Position ID|Comment",
    "Cash Operations": "Type|Instrument|Ticker|Category|Time|Amount|ID|Comment|Product|Position ID",
    "Open Positions": "Product|Instrument/Position|Ticker|Category|Type|Volume|Value|Current price|Open price|Open time (UTC)|Stop Loss|Take Profit|Net Profit %|Net Profit|Gross Profit|Margin|Open Commission|Swap|Rollover",
}
PATH = Path(__file__).with_name("account-demo-pln.xlsx")


def read_sheets():
    with ZipFile(PATH) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert not any("vba" in name.lower() or "externalLinks" in name for name in names)
        strings = []
        if "xl/sharedStrings.xml" in names:
            strings = ["".join(si.itertext()) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        result = {}
        date_cells = []
        for sheet in workbook.find("m:sheets", NS):
            name = sheet.attrib["name"]
            assert name in HEADERS
            rel = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = targets[rel]
            path = target.lstrip("/") if target.startswith("/") else "xl/" + target
            xml = ET.fromstring(archive.read(path))
            assert not xml.findall(".//m:f", NS), "Statement fixture must contain static export values"
            cells = {}
            for cell in xml.findall(".//m:c", NS):
                raw = cell.find("m:v", NS)
                kind = cell.attrib.get("t", "n")
                assert kind != "e", "Excel error"
                if kind == "inlineStr":
                    value = "".join(cell.find("m:is", NS).itertext())
                elif raw is None or raw.text is None:
                    value = ""
                elif kind == "s":
                    value = strings[int(raw.text)]
                elif kind == "n":
                    value = Decimal(raw.text)
                else:
                    value = raw.text
                cells[cell.attrib["r"]] = value
            header = HEADERS[name].split("|")
            assert [cells.get(f"{chr(65+i)}5", "") for i in range(len(header))] == header
            assert cells["A1"] == "Account number" and cells["B1"] == Decimal("10000001")
            assert cells["A2"] == name
            assert cells["A3"] == "Date from (UTC)" and cells["A4"] == "Date to (UTC)"
            assert isinstance(cells["B3"], Decimal) and isinstance(cells["B4"], Decimal)
            rows = []
            for row in xml.findall("m:sheetData/m:row", NS):
                number = int(row.attrib["r"])
                if number <= 5:
                    continue
                data = {label: cells.get(f"{chr(65+i)}{number}", "") for i, label in enumerate(header)}
                if not any(value != "" for value in data.values()):
                    continue
                for label in header:
                    if "time" in label.lower() and data[label] != "":
                        assert isinstance(data[label], Decimal), "Dates must be numeric Excel cells"
                        assert cells["B3"] <= data[label] <= cells["B4"]
                        date_cells.append((name, label))
                rows.append(data)
            result[name] = rows
        assert list(result) == list(HEADERS)
        assert len(date_cells) == 15
        return result


def verify():
    sheets = read_sheets()
    cash = sheets["Cash Operations"]
    closed = sheets["Closed Positions"]
    opened = sheets["Open Positions"]
    assert (len(cash), len(closed), len(opened)) == (8, 3, 5)
    assert len({row["ID"] for row in cash}) == 8
    assert [row["Time"] for row in cash] == sorted(row["Time"] for row in cash)
    balance, net_deposits = Decimal(0), Decimal(0)
    quantities, bought, sold = defaultdict(Decimal), {}, {}
    for row in cash:
        amount, kind = row["Amount"], row["Type"]
        assert isinstance(amount, Decimal)
        balance += amount
        assert balance >= 0, "Negative cash at an intermediate date"
        if kind in ("Deposit", "Withdrawal"):
            assert (amount > 0) == (kind == "Deposit")
            net_deposits += amount
            continue
        assert kind in ("Stock purchase", "Stock sell")
        match = re.fullmatch(r"(OPEN|CLOSE) BUY (\S+) ([0-9.]+) @ ([0-9.]+)", row["Comment"])
        assert match and match[2] == row["Ticker"]
        qty, price = Decimal(match[3]), Decimal(match[4])
        assert qty > 0 and price > 0
        buy = kind == "Stock purchase"
        assert match[1] == ("OPEN" if buy else "CLOSE")
        assert amount == qty * price * (-1 if buy else 1)
        quantities[row["Ticker"]] += qty if buy else -qty
        assert quantities[row["Ticker"]] >= 0
        (bought if buy else sold)[row["Position ID"]] = (qty, price, row["Time"], row["Ticker"])
    assert balance == Decimal("2930") and net_deposits == Decimal("4800")
    assert dict(quantities) == {"XTB.PL": Decimal("9.5"), "PKO.PL": Decimal("20"), "PZU.PL": Decimal(0)}
    assert closed[-1]["Instrument"] == "Profit/loss"
    assert closed[-1]["Profit/Loss"] == closed[-1]["Gross Profit"] == Decimal("130")
    realized = Decimal(0)
    for row in closed[:-1]:
        position = row["Position ID"]
        qty, price, time, ticker = sold[position]
        assert (row["Volume"], row["Close Price"], row["Close Time (UTC)"], row["Ticker"]) == (qty, price, time, ticker)
        assert (row["Open Price"], row["Open Time (UTC)"]) == bought[position][1:3]
        assert row["Type"] == "BUY" and row["Commission"] == row["Swap"] == row["Rollover"] == 0
        assert row["Open Conversion Rate"] == row["Close Conversion Rate"] == 1
        assert row["Purchase Value"] == qty * row["Open Price"]
        assert row["Sale Value"] == qty * price
        assert row["Profit/Loss"] == row["Gross Profit"] == qty * (price - row["Open Price"])
        realized += row["Profit/Loss"]
    lots = [row for row in opened if row["Type"] == "BUY"]
    groups = [row for row in opened if row["Type"] == ""]
    assert len(lots) == 3 and len(groups) == 2
    for row in lots:
        position = row["Instrument/Position"]
        qty, price, time, ticker = bought[position]
        assert row["Volume"] == qty - sold.get(position, (Decimal(0),))[0]
        assert (row["Open price"], row["Open time (UTC)"], row["Ticker"]) == (price, time, ticker)
        assert row["Open Commission"] == row["Swap"] == row["Rollover"] == 0
        assert row["Value"] == row["Volume"] * row["Current price"]
        assert row["Net Profit"] == row["Gross Profit"] == row["Volume"] * (row["Current price"] - price)
        assert abs(row["Net Profit %"] - row["Net Profit"] / (row["Volume"] * price) * 100) < Decimal("0.000000000001")
    for group in groups:
        same = [row for row in lots if row["Ticker"] == group["Ticker"]]
        for label in ("Volume", "Value", "Net Profit", "Gross Profit"):
            assert group[label] == sum(row[label] for row in same)
        assert group["Volume"] == quantities[group["Ticker"]]
    # Group rows are summaries, not additional holdings.
    assets = sum(row["Value"] for row in lots)
    unrealized = sum(row["Net Profit"] for row in lots)
    assert assets == Decimal("2430") and realized == Decimal("130") and unrealized == Decimal("430")
    assert balance + assets == Decimal("5360")
    assert balance + assets - net_deposits == realized + unrealized == Decimal("560")
    print("PASS: XLSX structure/types, 8 cash rows, 3 open lots, 2 closed lots; cash 2930 PLN, assets 2430 PLN, total 5360 PLN, P/L 560 PLN. No DB access.")


if __name__ == "__main__":
    verify()
