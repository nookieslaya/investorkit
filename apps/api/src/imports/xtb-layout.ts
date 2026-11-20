// Exact English layout documented by the pinned source in tests/fixtures/xtb/README.md.
// Other layouts must fail explicitly, never be guessed from loosely matched headers.
export const XTB_HEADERS = {
  'Closed Positions': ['Instrument','Ticker','Category','Type','Volume','Open Price','Open Time (UTC)','Close Price','Close Time (UTC)','Product','Profit/Loss','Gross Profit','Purchase Value','Sale Value','Stop Loss','Take Profit','Commission','Margin','Swap','Rollover','Open Conversion Rate','Close Conversion Rate','Close Origin','Position ID','Comment'],
  'Cash Operations': ['Type','Instrument','Ticker','Category','Time','Amount','ID','Comment','Product','Position ID'],
  'Open Positions': ['Product','Instrument/Position','Ticker','Category','Type','Volume','Value','Current price','Open price','Open time (UTC)','Stop Loss','Take Profit','Net Profit %','Net Profit','Gross Profit','Margin','Open Commission','Swap','Rollover'],
} as const;
